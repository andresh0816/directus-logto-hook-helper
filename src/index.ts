import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { FilterHandler, Query, Role } from '@directus/types';

const identificationNullError = createError("IDENTIFICATION_NULL", "The idenfification field is required. Please contact support", 400);
const userInfoNullError = createError("USER_INFO_NULL", "The user info is required. Please contact support", 500);
const wrongOrganizationError = createError("WRONG_ORGANIZATION", "The current user does not belong to this organization.", 403);
const userHasNoRoleError = createError("USER_HAS_NO_ROLE", "The user does not have a role assigned. Please contact support", 400);
const roleNotFoundError = createError("ROLE_NOT_FOUND", "The role could not be found. Please contact support", 404);

enum BytarsRole {
	Client = "Client",
	Admin = "Admin"
}

export default defineHook(({ filter }, { services, logger, env }) => {
	// Cache organization ID to avoid repeated environment variable access
	const organizationId = env['BYTARS_ORGANIZATION_ID'];
	const bytarsAccountsType = [BytarsRole.Client, BytarsRole.Admin];

	// Pre-validate environment configuration
	if (!organizationId) {
		logger.error('BYTARS_ORGANIZATION_ID environment variable is not set');
		throw new Error('BYTARS_ORGANIZATION_ID environment variable is not set');
	}

	const handler: FilterHandler<any> = async (payload, meta, context) => {
		logger.info("Filter handler executed");
		
		// Early validation of required data
		const userInfo = meta?.providerPayload?.userInfo;
		if (!userInfo) {
			logger.error('Provider payload does not contain user info');
			throw new userInfoNullError();
		}

		// Validate user belongs to organization (optimized with single pass)
		const organizationKey = Object.keys(userInfo).find(key => 
			key.startsWith('organizations.') && userInfo[key] === organizationId
		);

		if (!organizationKey) {
			logger.error(`User does not belong to this organization: ${organizationId}`);
			throw new wrongOrganizationError();
		}

		// Extract organization index efficiently
		const userOrgIndex = Number(organizationKey.split('.')[1]);
		if (userOrgIndex < 0) {
			logger.error(`Invalid user organization index: ${userOrgIndex}`);
			throw new Error(`Invalid user organization index: ${userOrgIndex}`);
		}

		// Find organization role efficiently with single pass
		let rawRole: string | null = null;
		
		// Look for school-specific role first
		for (const key of Object.keys(userInfo)) {
			if (key.startsWith('organization_roles.')) {
				const roleValue = userInfo[key];
				if (typeof roleValue === 'string') {
					const [orgId, roleName] = roleValue.split(":");
					if (orgId === organizationId && roleName?.startsWith('school_')) {
						rawRole = roleValue;
						break;
					}
				}
			}
		}

		// Fallback to internal roles if no organization role found
		if (!rawRole) {
			// Extract roles from destructured format (roles.0, roles.1, etc.)
			const roleKeys = Object.keys(userInfo).filter(key => key.startsWith('roles.'));
			
			if (roleKeys.length === 0) {
				throw new userHasNoRoleError();
			}

			// Find internal role from destructured roles
			let internalRole: string | null = null;
			for (const roleKey of roleKeys) {
				const roleValue = userInfo[roleKey];
				if (typeof roleValue === 'string' && bytarsAccountsType.includes(roleValue as BytarsRole)) {
					internalRole = roleValue;
					break;
				}
			}

			if (!internalRole) {
				logger.error('User does not have bytars role assigned or any role assigned');
				throw new userHasNoRoleError();
			}

			rawRole = internalRole;
		}

		logger.info(`Raw role from userInfo: ${rawRole}`);

		// Parse role name efficiently
		const roleParts = rawRole.split(":");
		const bytarsRoleName = roleParts[1]?.trim() ?? rawRole; // Handle both org roles and internal roles
		const parsedName = bytarsRoleName.includes("_") ? bytarsRoleName.split("_")[1] : bytarsRoleName;
		const roleName = parsedName ? parsedName.charAt(0).toUpperCase() + parsedName.slice(1) : '';
		
		logger.info(`Role name parsed: ${roleName}`);
		if (!roleName) {
			throw new Error('Role name could not be extracted');
		}

		// Initialize services efficiently
		const { database, schema } = context;
		const { RolesService } = services;
		const rolesService = new RolesService({ schema, knex: database });

		// Query role by name
		const query: Query = {
			filter: {
				name: { _eq: roleName }
			}
		};
		const role: Role[] = await rolesService.readByQuery(query);

		if (role.length === 0) {
			logger.error(`Role not found for name: ${roleName}`);
			throw new roleNotFoundError();
		}

		logger.info(`Role fetched: ${JSON.stringify(role)}`);

		// Extract user data efficiently
		const name: string = userInfo['name'];
		const identification: string | null = userInfo['custom_data.identification'];

		if (!identification) {
			throw new identificationNullError();
		}

		// Split name efficiently
		const nameParts = name.split(" ");
		
		return {
			...payload,
			role: role[0]?.id,
			first_name: nameParts[0] || null,
			last_name: nameParts[1] || null,
			external_indentifier: meta.identifier,
			identification: identification
		};
	};

	filter("auth.create", handler);
	filter("auth.update", handler);
});

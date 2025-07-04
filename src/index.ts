import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { FilterHandler, Query, Role } from '@directus/types';

const identificationNullError = createError("IDENTIFICATION_NULL", "The idenfification field is required. Please contact support", 400);
const wrongOrganizationError = createError("WRONG_ORGANIZATION", "The current user does not belong to this organization.", 403);

export default defineHook(({ filter }, { services, logger, env }) => {
	const handler: FilterHandler<any> = async (payload, meta, context) => {
		logger.info("Filter handler executed")
		logger.info(`Value of payload: ${JSON.stringify(payload)}`);
		logger.info(`Value of meta: ${JSON.stringify(meta)}`);
		const { database, schema } = context;
		const { RolesService } = services;
		const rolesService = new RolesService({ schema, knex: database});
		const organizationId = env['BYTARS_ORGANIZATION_ID']
		logger.info(`Organization ID from environment: ${organizationId}`);

		if (!organizationId) {
			logger.error('BYTARS_ORGANIZATION_ID environment variable is not set');
			throw new Error('BYTARS_ORGANIZATION_ID environment variable is not set');
		}
		logger.info('Checking the user organization');
		const userOrganizationId = meta.providerPayload.userInfo['organization_data.0.id']
		logger.info(`User organization ID: ${userOrganizationId}`);

		if (!userOrganizationId) {
			logger.error('Provider payload does not contain organization data');
			throw new Error('Provider payload does not contain organization data');
		}

		if (userOrganizationId !== organizationId) {
			logger.error(`User does not belong to the organization with ID: ${organizationId}`);
			throw new wrongOrganizationError();
		}

		logger.info(`Working with userInfo: ${JSON.stringify(meta.providerPayload.userInfo)}`)
		if (!meta.providerPayload.userInfo) throw new Error('User info is required');

		// El campo organization_roles viene aplanado como "organization_roles.0"
		const rawRole: string = meta.providerPayload.userInfo['organization_roles.0'] ?? 
								meta.providerPayload.userInfo.organization_roles?.[0] ?? 
								null;
		logger.info(`Raw role from userInfo: ${rawRole}`);
		if (!rawRole) throw new Error('Role not found in userInfo');

		const roleName = rawRole.split(":")[1]?.trim();
		logger.info(`Role name parsed: ${roleName}`);
		if (!roleName) throw new Error('Role name could not be extracted');

		const query: Query = {
			filter: {
				name: {
					_eq: roleName
				}
			}
		}
		const role: Role[] = await rolesService.readByQuery(query);

		if (role.length === 0) {
			logger.error(`Role not found for name: ${roleName}`);
			throw new Error(`Role not found for name: ${roleName}`);
		}

		logger.info(`Role fetched: ${JSON.stringify(role)}`);

		const name: string = meta.providerPayload.userInfo['name'];
		const identification: string | null = meta.providerPayload.userInfo['custom_data.identification'];

		if (!identification || identification === "") {
			throw new identificationNullError();
		}

		return {
			...payload,
			role: role[0]?.id,
			first_name: name.split(" ")[0] || null,
			last_name: name.split(" ")[1] || null,
			external_indentifier: meta.identifier,
			identification: identification
		}
	}

	filter("auth.create", handler);
	filter("auth.update", handler);
});

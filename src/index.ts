import { defineHook } from '@directus/extensions-sdk';
import { FilterHandler, Query, Role } from '@directus/types';

export default defineHook(({ filter }, { services, logger }) => {
	const handler: FilterHandler<any> = async (payload, meta, context) => {
		logger.info("Filter handler executed")
		logger.info(`Value of payload: ${JSON.stringify(payload)}`);
		logger.info(`Value of meta: ${JSON.stringify(meta)}`);
		const { database, schema } = context;
		const { RolesService } = services;
		const rolesService = new RolesService({ schema, knex: database});

		try {
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
			const role: Role = await rolesService.readByQuery(query);

			if (!role) {
				logger.error(`Role not found for name: ${roleName}`);
				throw new Error(`Role not found for name: ${roleName}`);
			}

			logger.info(`Role fetched: ${JSON.stringify(role)}`);

			const name: string = meta.providerPayload.userInfo['name'];

			return {
				...payload,
				role: role.id,
				first_name: name.split(" ")[0] || null,
				last_name: name.split(" ")[1] || null,
				external_indentifier: meta.identifier
			}
		}
		catch (error: any) {
			logger.error('Error in filter handler:', error.message);
			throw new Error(`Filter handler error: ${error.message}`);
		}
	}

	filter("auth.create", handler);
	filter("auth.update", handler);
});

import { defineHook } from '@directus/extensions-sdk';
import { FilterHandler, Query, Role } from '@directus/types';

export default defineHook(({ filter }, { services, logger }) => {
	const handler: FilterHandler<any> = async (payload, meta, context) => {
		logger.info(`Filter handler executed: ${JSON.stringify(payload)}`);
		logger.info(`Filter handler executed: ${JSON.stringify(meta)}`);
		const { database, schema } = context;
		const { RolesService } = services;
		const rolesService = new RolesService({ schema, knex: database});

		try {
			logger.info(`Working with userInfo: ${JSON.stringify(meta.userInfo)}`)
			if (!meta.userInfo) throw new Error('User info is required');

			const rawRole: string = meta.userInfo['organization_roles.0'];
			logger.info("Raw role from userInfo:", rawRole);
			if (!rawRole) throw new Error('Role not found in userInfo');

			const roleName = rawRole.split(":")[1]?.trim();
			logger.info("Role name found:", roleName);
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

			const name: string = meta.userInfo['name'];

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

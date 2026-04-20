exports.up = async function (knex) {
  // Rename columns using raw SQL to preserve DEFAULT CURRENT_TIMESTAMP
  await knex.raw("ALTER TABLE `User` CHANGE `No` `id` int NOT NULL AUTO_INCREMENT");
  await knex.raw("ALTER TABLE `User` CHANGE `platformId` `platform_id` varchar(45) NOT NULL");
  await knex.raw(
    "ALTER TABLE `User` CHANGE `createDTM` `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP"
  );
  await knex.raw("ALTER TABLE `User` CHANGE `closeDTM` `closed_at` datetime NULL DEFAULT NULL");

  // Add LINE profile fields
  await knex.schema.alterTable("User", table => {
    table.string("picture_url", 500).nullable().after("display_name");
    table.string("status_message", 500).nullable().after("picture_url");
    table.string("language", 10).nullable().after("status_message");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("User", table => {
    table.dropColumn("language");
    table.dropColumn("status_message");
    table.dropColumn("picture_url");
  });

  await knex.raw("ALTER TABLE `User` CHANGE `id` `No` int NOT NULL AUTO_INCREMENT");
  await knex.raw("ALTER TABLE `User` CHANGE `platform_id` `platformId` varchar(45) NOT NULL");
  await knex.raw(
    "ALTER TABLE `User` CHANGE `created_at` `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP"
  );
  await knex.raw("ALTER TABLE `User` CHANGE `closed_at` `closeDTM` datetime NULL DEFAULT NULL");
};

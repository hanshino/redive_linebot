const Base = require("../base");

const TABLE = "equipment";

class Equipment extends Base {
  async findBySlot(slot) {
    return await this.knex.select("*").where({ slot });
  }

  async findByJobId(jobId) {
    return await this.knex.select("*").where({ job_id: jobId });
  }

  async findAvailableForJob(jobId) {
    return await this.knex.select("*").where({ job_id: jobId }).orWhereNull("job_id");
  }
}

const model = new Equipment({
  table: TABLE,
  fillable: ["name", "slot", "job_id", "rarity", "attributes", "description", "image_url"],
});

exports.table = TABLE;
exports.model = model;
exports.all = options => model.all(options);
exports.find = id => model.find(id);
exports.create = attributes => model.create(attributes);
exports.update = (id, attributes) => model.update(id, attributes);
exports.destroy = id => model.delete(id);
exports.findBySlot = slot => model.findBySlot(slot);
exports.findAvailableForJob = jobId => model.findAvailableForJob(jobId);

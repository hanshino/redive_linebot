const Base = require("../base");

const TABLE = "equipment";

class Equipment extends Base {
  async findByJobId(jobId) {
    return await this.knex.select("*").where({ job_id: jobId });
  }

  async findAvailableForJob(jobId) {
    const query = this.knex.select("*").whereNull("job_id");
    if (jobId) {
      query.orWhere({ job_id: jobId });
    }
    return await query;
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
exports.findAvailableForJob = jobId => model.findAvailableForJob(jobId);

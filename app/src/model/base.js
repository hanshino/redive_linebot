const mysql = require("../util/mysql");
const { get, pick } = require("lodash");

class Base {
  constructor({ table, fillable }) {
    this.table = table;
    this.fillable = fillable;
  }

  get knex() {
    return mysql(this.table);
  }

  /**
   * 所有資料
   * @param {Object} options 選填參數
   * @param {Object} options.filter 過濾條件
   * @param {Object} options.pagination 分頁設定
   * @param {Number} options.pagination.page 分頁頁數
   * @param {Number} options.pagination.perPage 分頁每頁顯示數量
   * @param {Object} options.order 排序設定
   * @param {String} options.order.column 排序欄位
   * @param {String} options.order.direction 排序方向
   * @param {Array}  options.select 選擇欄位
   * @returns {Promise<Array>}
   */
  async all(options = {}) {
    const filter = get(options, "filter", {});
    const pagination = get(options, "pagination", {});
    const order = get(options, "order", {});
    const select = get(options, "select", ["*"]);

    let query = mysql(this.table);

    Object.keys(filter).forEach(key => {
      query = query.where(key, filter[key]);
    });

    if (pagination.page) {
      query = query.limit(pagination.perPage).offset(pagination.perPage * (pagination.page - 1));
    }

    if (order.column) {
      query = query.orderBy(order.column, order.direction || "asc");
    }

    return await query.select(select);
  }

  /**
   * 查找單筆資料
   * @param {Number} id
   * @returns {Promise<?Object>}
   */
  async find(id) {
    return await mysql.first().from(this.table).where({ id });
  }

  /**
   * Alias of `find`
   * @param {Number} id
   * @returns {Promise<?Object>}
   */
  findById(id) {
    return this.find(id);
  }

  /**
   * 新增資料
   * @param {Object} attributes 屬性
   * @returns {Promise<Number>}
   */
  async create(attributes = {}) {
    let data = pick(attributes, this.fillable);
    return await mysql(this.table).insert(data);
  }

  /**
   * 更新資料
   * @param {Number} id
   * @param {Object} attributes
   * @returns {Promise<Number>}
   */
  async update(id, attributes = {}) {
    let data = pick(attributes, this.fillable);
    return await mysql(this.table).update(data).where({ id });
  }

  /**
   * 刪除資料
   * @param {Number} id
   * @returns {Promise<Number>}
   */
  async delete(id) {
    return await mysql(this.table).delete().where({ id });
  }
}

module.exports = Base;

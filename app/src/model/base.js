const mysql = require("../util/mysql");
const { get, pick } = require("lodash");

class Base {
  constructor({ table, fillable }) {
    this.table = table;
    this.fillable = fillable;
    this.trx = null;
  }

  /**
   * @returns { import("knex").Knex }
   */
  get knex() {
    if (!this.trx && this.trx.isCompleted) {
      return this.trx;
    } else {
      return mysql(this.table);
    }
  }

  async transaction() {
    this.trx = await this.knex.transaction();
    return this.trx;
  }

  /**
   * 所有資料
   * @param {Object} options 選填參數
   * @param {Object} options.filter 過濾條件
   * @param {Object} options.pagination 分頁設定
   * @param {Number} options.pagination.page 分頁頁數
   * @param {Number} options.pagination.perPage 分頁每頁顯示數量
   * @param {Array<{column: String, direction: String}>} options.order 排序設定
   * @param {Array}  options.select 選擇欄位
   * @returns {Promise<Array>}
   */
  async all(options = {}) {
    const filter = get(options, "filter", {});
    const pagination = get(options, "pagination", {});
    const order = get(options, "order", []);
    const select = get(options, "select", ["*"]);

    let query = this.knex;

    Object.keys(filter).forEach(key => {
      query = query.where(
        key,
        get(filter, `${key}.operator`, "="),
        get(filter, `${key}.value`, filter[key])
      );
    });

    if (pagination.page) {
      query = query.limit(pagination.perPage).offset(pagination.perPage * (pagination.page - 1));
    }

    order.forEach(item => {
      let col = get(item, "column");
      if (!col) return;
      query = query.orderBy(col, get(item, "direction", "asc"));
    });

    return await query.select(select);
  }

  /**
   * 單筆資料
   * @param {Object} options 選填參數
   * @param {Object} options.filter 過濾條件
   * @param {Array<{column: String, direction: String}>} options.order 排序設定
   * @param {Array}  options.select 選擇欄位
   * @returns {Promise<Array>}
   */
  async first(options = {}) {
    const filter = get(options, "filter", {});
    const order = get(options, "order", []);
    const select = get(options, "select", ["*"]);

    let query = this.knex;

    Object.keys(filter).forEach(key => {
      query = query.where(
        key,
        get(filter, `${key}.operator`, "="),
        get(filter, `${key}.value`, filter[key])
      );
    });

    order.forEach(item => {
      let col = get(item, "column");
      if (!col) return;
      query = query.orderBy(col, get(item, "direction", "asc"));
    });

    console.log(query.toSQL().toNative());

    return await query.first(select);
  }

  /**
   * 查找單筆資料
   * @param {Number} id
   * @returns {Promise<Object>}
   */
  async find(id) {
    return await mysql.first().from(this.table).where({ id });
  }

  /**
   * 新增資料
   * @param {Object} attributes 屬性
   * @returns {Promise<Number>}
   */
  async create(attributes = {}) {
    let data = pick(attributes, this.fillable);
    return await this.knex.insert(data);
  }

  /**
   * 更新資料
   * @param {Number} id
   * @param {Object} attributes
   * @returns {Promise<Number>}
   */
  async update(id, attributes = {}) {
    let data = pick(attributes, this.fillable);
    return await this.knex.update(data).where({ id });
  }

  /**
   * 刪除資料
   * @param {Number} id
   * @returns {Promise<Number>}
   */
  async delete(id) {
    return await this.knex.delete().where({ id });
  }
}

module.exports = Base;

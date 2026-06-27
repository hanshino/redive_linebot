const mysql = require("../util/mysql");
const { get, pick } = require("lodash");

class Base {
  constructor({ table, fillable }) {
    this.table = table;
    this.fillable = fillable;
  }

  /**
   * 取得綁定本表的 query builder。
   * 交易一律由呼叫端用 `mysql.transaction(async trx => ...)` 建立並把 `trx` 往下傳，
   * 不再存在實例上 —— 否則 model 是行程級單例，並發請求會共用同一條交易而互相汙染。
   * @param {import("knex").Knex.Transaction} [trx] 選填；傳入則在該交易內執行
   * @returns {import("knex").Knex.QueryBuilder}
   */
  qb(trx) {
    return (trx || mysql)(this.table);
  }

  /**
   * @returns { import("knex").Knex.QueryBuilder }
   */
  get knex() {
    return mysql(this.table);
  }

  /**
   * @returns {import("knex").Knex.QueryBuilder}
   */
  get connection() {
    return mysql;
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
   * @param {Number} options.limit  限制數量
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {import("knex").Knex.QueryBuilder}
   */
  all(options = {}, trx) {
    const filter = get(options, "filter", {});
    const pagination = get(options, "pagination", {});
    const order = get(options, "order", []);
    const select = get(options, "select", ["*"]);
    const limit = get(options, "limit", null);

    let query = this.qb(trx);

    Object.keys(filter).forEach(key => {
      query = query.where(
        key,
        get(filter, `${key}.operator`, "="),
        get(filter, `${key}.value`, filter[key])
      );
    });

    if (pagination.page) {
      query = query.limit(pagination.perPage).offset(pagination.perPage * (pagination.page - 1));
    } else if (limit) {
      query = query.limit(limit);
    }

    order.forEach(item => {
      let col = get(item, "column");
      if (!col) return;
      query = query.orderBy(col, get(item, "direction", "asc"));
    });

    return query.select(select);
  }

  /**
   * 單筆資料
   * @param {Object} options 選填參數
   * @param {Object} options.filter 過濾條件
   * @param {Array<{column: String, direction: String}>} options.order 排序設定
   * @param {Array}  options.select 選擇欄位
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {import("knex").Knex.QueryBuilder}
   */
  first(options = {}, trx) {
    const filter = get(options, "filter", {});
    const order = get(options, "order", []);
    const select = get(options, "select", ["*"]);

    let query = this.qb(trx);

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

    return query.first(select);
  }

  /**
   * 查找單筆資料
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {Promise<?Object>}
   */
  async find(id, trx) {
    return await this.qb(trx).first().where({ id });
  }

  /**
   * Alias of `find`
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {Promise<?Object>}
   */
  findById(id, trx) {
    return this.find(id, trx);
  }

  /**
   * 新增資料
   * @param {Object} attributes 屬性
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {Promise<Number>}
   */
  async create(attributes = {}, trx) {
    let data = pick(attributes, this.fillable);
    const [id] = await this.qb(trx).insert(data);

    return id;
  }

  async insert(data = [], trx) {
    return await this.qb(trx).insert(data);
  }

  /**
   * 更新資料
   * @param {Number} id
   * @param {Object} attributes
   * @param {Object} options
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {Promise<Number>}
   */
  async update(id, attributes = {}, options = {}, trx) {
    let data = pick(attributes, this.fillable);
    const query = this.qb(trx).update(data);

    const pk = get(options, "pk", "id");
    query.where({
      [pk]: id,
    });

    return await query;
  }

  /**
   * 刪除資料
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} [trx] 選填交易
   * @returns {Promise<Number>}
   */
  async delete(id, trx) {
    return await this.qb(trx).delete().where({ id });
  }

  getColumnName(column) {
    return `${this.table}.${column}`;
  }
}

module.exports = Base;

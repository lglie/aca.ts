/// <reference types="../types" />

import { isEmpty, notEmpty } from '../libs/common'

// 判断给定对象或数组的元素的增加或减少
function Fluctuate(curr: any, prev: any, rtn: any): any[] {
  if (isEmpty(curr) || isEmpty(prev)) {
    if (notEmpty(curr)) rtn.add = curr
    else if (notEmpty(prev)) rtn.remove = prev
    return []
  }
  const currArr = (Array.isArray(curr) ? curr : Object.keys(curr)).map((v) =>
    // 有可能元素是数组，对元素全部字符化
    JSON.stringify(v)
  )
  const prevArr = (Array.isArray(prev) ? prev : Object.keys(prev)).map((v) =>
    JSON.stringify(v)
  )
  let contains = [...currArr]
  // 增加的
  let add = currArr.reduce((_, v) => {
    if (!prevArr.includes(v)) _.push(v)
    return _
  }, [])
  // 删除的
  let remove = prevArr.reduce((_, v) => {
    if (!currArr.includes(v)) _.push(v)
    return _
  }, [])
  // 存在的
  add.concat(remove).forEach((v) => {
    if (contains.includes(v)) contains.splice(contains.indexOf(v), 1)
  })

  add = add.map((v) => JSON.parse(v))
  remove = remove.map((v) => JSON.parse(v))
  contains = contains.map((v) => JSON.parse(v))

  const obj = {
    add: Array.isArray(curr) ? add : add.map((v) => curr[v]),
    remove: Array.isArray(curr) ? remove : remove.map((v) => prev[v]),
  }
  for (const k in obj) {
    if (notEmpty(obj[k])) {
      rtn[k] = obj[k]
    }
  }

  return contains
}

export default function (curr: FlatTables, prev: FlatTables) {
  const rtn = {
    create: <TableView[]>[],
    remove: <TableView[]>[],
    alter: {},
  }
  const contains = Fluctuate(curr, prev, rtn)

  contains.forEach((v) => {
    if (curr[v].map !== prev[v].map && curr[v].dbName !== prev[v].dbName) {
      rtn.alter[v] = rtn.alter[v] || {}
      rtn.alter[v].map = { new: curr[v].dbName, old: prev[v].dbName }
    }

    rtn.alter[v] = rtn.alter[v] || {}
    rtn.alter[v]['columns'] = rtn.alter[v]['columns'] || {}
    Column(rtn.alter[v]['columns'], curr[v]['columns'], prev[v]['columns'])
    if (isEmpty(rtn.alter[v]['columns'])) delete rtn.alter[v]['columns']
    rtn.alter[v]['props'] = BlockProps(curr[v]['props'], prev[v]['props'])
    if (isEmpty(rtn.alter[v]['props'])) delete rtn.alter[v]['props']
    if (isEmpty(rtn.alter[v])) delete rtn.alter[v]
  })

  for (const k in rtn) {
    if (isEmpty(rtn[k])) delete rtn[k]
  }

  return rtn
}

function Column(column, curr, prev) {
  const colAlt = (column.alter = {})
  const colContains = Fluctuate(curr, prev, column)

  // 如果添加的字段是关系字段，且为外键字段（供后面添加外键使用）
  if (column.add) {
    column.add = column.add.filter((v3) => {
      const rel = v3.props.jsType.split('.')
      return rel[1] ? (v3.props.foreign ? true : false) : true
    })
    if (isEmpty(column.add)) delete column.add
  }
  // 如果删除的字段是关系字段，且对向关系表如果不存在，则过滤该字段（不生成sql）
  if (column.remove) {
    column.remove = column.remove.filter((v3) => {
      const rel = v3.props.jsType.split('.')
      return rel[1] ? (curr[rel[0]] ? true : false) : true
    })

    if (isEmpty(column.remove)) delete column.remove
  }

  for (const v of colContains) {
    const cCol = curr[v],
      pCol = prev[v]
    // 如果是关系字段则返回
    if (cCol.type.split('.').length > 1) continue
    colAlt[v] = {}
    if (cCol.map !== pCol.map && cCol.dbName !== pCol.dbName) {
      colAlt[v].map = { new: cCol.dbName, old: pCol.dbName }
    }
    ;['optional', 'type'].forEach((v4) => {
      if (cCol[v4] !== pCol[v4]) {
        colAlt[v][v4] = { new: cCol[v4], old: pCol[v4] }
      }
    })
    ;[
      'idType',
      'isArray',
      'dbType',
      'jsType',
      'unique',
      'index',
      'check',
      'default',
      'createdAt',
      'updatedAt',
    ].forEach((v2) => {
      colAlt[v].props = colAlt[v].props || {}
      if ((<Column>cCol).props[v2] !== (<Column>pCol).props[v2]) {
        colAlt[v].props[v2] = {
          new: (<Column>cCol).props[v2],
          old: (<Column>pCol).props[v2],
        }
      }
    })

    // 处理外键
    if ((<Column>cCol).props.foreign || (<Column>pCol).props.foreign) {
    }
    if (isEmpty(colAlt[v].props)) delete colAlt[v].props
    if (isEmpty(colAlt[v])) delete colAlt[v]
  }
  if (isEmpty(colAlt)) delete column.alter
}

function BlockProps(curr, prev) {
  const rtn = {}
  // if (curr['deprecated'] !== prev['deprecated'])
  //   rtn['deprecated'] = { new: curr['deprecated'], old: prev['deprecated'] }
  for (const v of ['indexes', 'uniques']) {
    rtn[v] = rtn[v] || {}
    Fluctuate(curr[v], prev[v], rtn[v])
    if (isEmpty(rtn[v])) delete rtn[v]
  }
  return rtn
}

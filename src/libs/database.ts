/// <reference types="../types" />

import SqlDiff from './sql-diff'
import { MapTblName, AddQuote, FlatTables, notEmpty } from './common'
import ormDiff from '../orm/table-diff'

// 创建表的sql
function CreateTblSql(config: DbConfig, tbls: FlatTables, jsName: string) {
  const sqlDiff = SqlDiff(config.connectOption.driver)
  const rtn: {
    create: string[]
    alter: string[]
    mapTable: object
  } = { create: [], alter: [], mapTable: {} }
  const create: string[] = []
  const uniques: string[] = []
  const foreigns: string[] = []

  for (const k in tbls[jsName].columns) {
    const colObj = tbls[jsName].columns[k]
    // 是创建视图
    if ((<TableView>tbls[jsName]).kind === 'view') {
    } else {
      const colSql = createColSql(config, tbls, jsName, <Column>colObj)
      create.push(...colSql.create)
      uniques.push(...colSql.unique)
      foreigns.push(...colSql.foreign)
      rtn.alter.push(...colSql.alter)
      Object.assign(rtn.mapTable, colSql.mapTable)
    }
  }
  // 添加表的块属性
  const tblProps = <TableProp>tbls[jsName].props
  if (tblProps.id)
    create.push(
      `PRIMARY KEY (${AddQuote(
        tblProps.id!.map((v) => tbls[jsName].columns[v].dbName)
      ).toString()})`
    )
  if (tblProps.uniques) {
    tblProps.uniques.forEach((v) => {
      const cols = v.map((v2) => tbls[jsName].columns[v2].dbName)
      uniques.push(
        sqlDiff.tbl(tbls[jsName].dbName).constraint.unique('ADD', cols)
      )
    })
  }
  if (tblProps.indexes) {
    tblProps.indexes.forEach((v) => {
      const cols = v.map((v2) => tbls[jsName].columns[v2].dbName)
      rtn.alter.push(
        sqlDiff.tbl(tbls[jsName].dbName).constraint.index('CREATE', cols)
      )
    })
  }
  if ((<ViewProp>tblProps).select) {
  }

  if (config.connectOption.driver === 'betterSqlite3') {
    rtn.create.push(
      sqlDiff
        .tbl(tbls[jsName].dbName)
        .create(create.concat(uniques).concat(foreigns).join(',\n'))
    )
  } else {
    rtn.create.push(sqlDiff.tbl(tbls[jsName].dbName).create(create.join(',\n')))
    rtn.alter.push(uniques.concat(foreigns).join(';\n\n'))
  }
  return rtn
}

export function RemoveTblSql(
  config: DbConfig,
  tbls: FlatTables,
  jsName: string
) {
  const sqlDiff = SqlDiff(config.connectOption.driver)
  if (tbls[jsName].kind === 'view') return { remove: [``], alter: [] }

  const rtn = { remove: <string[]>[], alter: <string[]>[] }
  rtn.remove.push(sqlDiff.tbl(tbls[jsName].dbName).drop())

  for (const k in tbls[jsName].columns) {
    const col = <Column>tbls[jsName].columns[k]
    // 处理关系字段，只处理主键和多对多关系的映射表
    if (col.type.split('.').length > 1 && !col.props.foreign) {
      const [relTblName, relCol] = col.props.jsType.split('.')
      const relTbl = <Table>tbls[relTblName]
      const relColName = relCol.match(/\w+/)[0]

      // 是多对多的关系字段，移除关系映射表
      if (col.type.endsWith(']')) {
        rtn.remove.push(
          sqlDiff
            .tbl(
              MapTblName(
                tbls[jsName].dbName,
                col.dbName,
                relTbl.dbName,
                relTbl.columns[relColName].dbName
              )
            )
            .drop()
        )
      } // 是主键字段，删除关系表的外键
      else {
        const keys = relTbl.columns[relColName].props.foreign.keys
        rtn.alter.push(sqlDiff.tbl(relTbl.dbName).mutate.drop(keys))
      }
    }
  }

  return rtn
}

export function AlterTblSql(
  config: DbConfig,
  tbls: FlatTables,
  alter: DbAlter
) {
  const sqlDiff = SqlDiff(config.connectOption.driver)
  const rtn = {
    create: <string[]>[],
    remove: <string[]>[],
    alter: <string[]>[],
  }

  for (const k in alter) {
    const tbl = <Table>tbls[k]
    if (alter[k].map) {
      rtn.alter.push(sqlDiff.tbl(alter[k].map.old).rename(alter[k].map.new))
    }

    // 块属性
    if (alter[k].props) {
      const cst = sqlDiff.tbl(tbl.dbName).constraint
      for (const k2 in alter[k].props) {
        switch (k2) {
          case 'uniques':
            const U = alter[k].props[k2]
            if (U.add) {
              U.add.forEach((v) => rtn.alter.push(cst.unique('ADD', v)))
            }
            if (U.remove) {
              U.remove.forEach((v) => rtn.alter.push(cst.unique('DROP', v)))
            }
            break
          case 'indexes':
            const I = alter[k].props[k2]
            if (I.add) {
              I.add.forEach((v) => rtn.alter.push(cst.index('CREATE', v)))
            }
            if (I.remove) {
              I.remove.forEach((v) => rtn.alter.push(cst.index('DROP', v)))
            }
            break
          case 'id':
            throw `不能修改id，${tbl.name}`
        }
      }
    }

    if (alter[k].columns) {
      if (alter[k].columns.add) {
        let constraint
        const columns = []
        alter[k].columns.add.forEach((v) => {
          // 添加外键约束(根据acaconfig.json的配置)
          if (v.props.foreign) {
            const relTbl = <Table>tbls[v.props.jsType.split('.')[0]]
            constraint = sqlDiff
              .tbl(tbl.dbName)
              .constraint.foreign('ADD', v.props.foreign, relTbl)
          } else if (v.type.split('.').length === 1) {
            const dbType = tbl.columns[v.jsName].props.dbType.toLowerCase()
            const notNull =
              tbl.columns[v.jsName].optional === 'required' ? true : false
            columns.push(<AddColumn>{
              name: v.dbName,
              dbType: (sqlDiff.keyword.dbType[dbType] || dbType).toUpperCase(),
              notNull,
            })
          }
        })

        rtn.alter.push(sqlDiff.tbl(tbl.dbName).mutate.add(columns))
        if (constraint) rtn.alter.push(constraint)
      }

      if (alter[k].columns.remove) {
        const cols = alter[k].columns['remove'].map((v) => v.dbName)
        rtn.alter.push(sqlDiff.tbl(tbl.dbName).mutate.drop(cols))
      }

      if (alter[k].columns.alter) {
        for (const k2 in alter[k].columns.alter) {
          const alterCol = alter[k].columns.alter[k2]
          const colName = tbl.columns[k2].dbName
          if (alterCol.map) {
            rtn.alter.push(
              sqlDiff
                .tbl(tbl.dbName)
                .mutate.alter(alterCol.map.old)
                .rename(alterCol.map.new)
            )
          }
          if (alterCol.optional) {
            rtn.alter.push(
              sqlDiff
                .tbl(tbl.dbName)
                .mutate.alter(colName)
                .notNull(
                  <'SET' | 'DROP'>(
                    { required: 'SET', optional: 'DROP' }[alterCol.optional.new]
                  )
                )
            )
          }
          if (alterCol.type) {
            rtn.alter.push(
              sqlDiff
                .tbl(tbl.dbName)
                .mutate.alter(colName)
                .type(alterCol.type.new)
            )
          }
          if (alterCol.props) {
            if (alterCol.props.isId) {
              throw new Error(`表：${tbl.name}，不允许更改表的id`)
            }
            if (alterCol.props.isArray) {
              throw new Error(
                `${tbl.name}.${colName}，不支持数组与标量类型之间的转换`
              )
            }
            if (alterCol.props.dbType) {
              rtn.alter.push(
                sqlDiff
                  .tbl(tbl.dbName)
                  .mutate.alter(colName)
                  .type(alterCol.props.dbType.new)
              )
            }
            if (alterCol.props.unique) {
              const action = alterCol.props.unique.new ? 'ADD' : 'DROP'
              rtn.alter.push(
                sqlDiff.tbl(tbl.dbName).constraint.unique(action, colName)
              )
            }
            if (alterCol.props.index) {
              const action = alterCol.props.index.new ? 'CREATE' : 'DROP'
              rtn.alter.push(
                sqlDiff.tbl(tbl.dbName).constraint.index(action, colName)
              )
            }
            if (alterCol.props.check) {
              rtn.alter.push(
                sqlDiff
                  .tbl(tbl.dbName)
                  .mutate.alter(colName)
                  .check(alterCol.props.check.new)
              )
            }
            if (alterCol.props.default !== undefined) {
              rtn.alter.push(
                sqlDiff
                  .tbl(tbl.dbName)
                  .mutate.alter(colName)
                  .default(alterCol.props.default.new)
              )
            }
            if (alterCol.props.createdAt) {
              if (alterCol.props.createdAt.new) {
                rtn.alter.push(
                  sqlDiff
                    .tbl(tbl.dbName)
                    .mutate.alter(colName)
                    .default('CURRENT_TIMESTAMP')
                )
                rtn.alter.push(
                  sqlDiff.tbl(tbl.dbName).mutate.alter(colName).notNull('DROP')
                )
              } else {
                rtn.alter.push(
                  sqlDiff.tbl(tbl.dbName).mutate.alter(colName).default()
                )
              }
            }
            if (alterCol.props.updatedAt) {
              if (alterCol.props.updatedAt.new) {
                rtn.alter.push(
                  sqlDiff
                    .tbl(tbl.dbName)
                    .mutate.alter(colName)
                    .default('CURRENT_TIMESTAMP')
                )
                rtn.alter.push(
                  sqlDiff.tbl(tbl.dbName).mutate.alter(colName).notNull('DROP')
                )
              } else {
                rtn.alter.push(
                  sqlDiff.tbl(tbl.dbName).mutate.alter(colName).default()
                )
              }
            }
            if (alterCol.props.foreign) {
              throw new Error(`字段：${tbl.name}.${colName}，不允许更改外键`)
            }
          }
        }
      }
    }
  }
  return rtn
}

function createColSql(
  config: DbConfig,
  tbls: FlatTables,
  jsName: string,
  colObj: Column
) {
  const driver = config.connectOption.driver
  const sqlDiff = SqlDiff(driver)
  const typ = sqlDiff.keyword
  const qPrefix = typ.quote.prefix
  const qName = typ.quote.name
  const props = colObj.props
  const tblName = tbls[jsName].dbName
  const colName = colObj.dbName
  const rtn = {
    create: <string[]>[],
    unique: <string[]>[],
    foreign: <string[]>[],
    alter: <string[]>[],
    mapTable: {},
  }
  const splits = colObj.type.match(/[\w\.]+/)![0].split('.')
  // 是标量字段
  if (splits.length === 1) {
    // 是标量字段
    const dbType = ` ${(
      typ.dbType[props.dbType] || props.dbType
    ).toUpperCase()}`
    let columnSql = `${qPrefix}${colName}${qName}`

    if (props.idType) {
      if (props.isId) {
        const primaryKey = sqlDiff.keyword.stmt.primaryKey.toUpperCase()
        const autoincrement =
          props.idType === 'autoincrement'
            ? sqlDiff.keyword.stmt.autoincrement.toUpperCase()
            : ''
        columnSql += `${dbType}${primaryKey}${autoincrement}`
      } else {
        if (props.idType === 'autoincrement') {
          columnSql += driver === 'pg' ? ` INT8` : `${dbType}`
        } else {
          columnSql += `${dbType}`
        }
      }
    } else {
      columnSql += `${dbType}`
    }

    columnSql += `${colObj.optional === 'required' ? ' NOT NULL' : ''}`

    // 添加属性：unique、default、check、createdAt、updatedAt
    if (props.default !== undefined) {
      let dft = props.default
      // 需要添加引号的类型
      // if (!['boolean', 'int', 'float', 'datetime'].includes(colObj.type))
      //   dft = `'${dft}'`
      columnSql += ` DEFAULT ${dft}`
    }
    if (props.unique)
      rtn.unique.push(sqlDiff.tbl(tblName).constraint.unique('ADD', colName))
    // 添加索引语句
    if (props.index)
      rtn.alter.push(sqlDiff.tbl(tblName).constraint.index('CREATE', colName))
    columnSql += props.check ? ` ${props.check}` : ''
    columnSql += props.createdAt ? sqlDiff.keyword.timestamp.create : ''
    columnSql += props.updatedAt ? sqlDiff.keyword.timestamp.update : ''
    rtn.create.push(columnSql.trim())
  } // 是关系字段
  else {
    // 查找关系表
    const spt = colObj.props.jsType.split('.')
    const relTblName = spt[0]
    const relTbl = <Table>tbls[relTblName]
    const relColName = spt[1].match(/\w+/)[0]
    const relCol = relTbl.columns[relColName]
    // 是多对多的关系，要建关系映射表
    if (!colObj.props.foreign && colObj.type.endsWith(']')) {
      // 查找关系表的id
      rtn.mapTable[
        MapTblName(
          relTbl.dbName,
          relCol.dbName,
          tbls[jsName].dbName,
          colObj.dbName
        )
      ] = [tbls[spt[0]], tbls[jsName]]
    } // 是外键，根据配置是否设置外键约束
    else if (props.foreign) {
      if (config.foreignKeyConstraint) {
        rtn.foreign.push(
          sqlDiff
            .tbl(tblName)
            .constraint.foreign('ADD', props.foreign, <Table>tbls[spt[0]])
        )
      }

      // 一对一关系, 需添加unique约束
      if ('array' !== relCol.optional) {
        rtn.unique.push(
          sqlDiff
            .tbl(tblName)
            .constraint.unique('ADD', colObj.props.foreign.keys)
        )
      }
    }
  }

  return rtn
}

export function CreateMapTblSql(
  config: DbConfig,
  mapName: string,
  tbl: [Table, Table]
) {
  const sqlDiff = SqlDiff(config.connectOption.driver)
  const typ = sqlDiff.keyword
  const qPrefix = typ.quote.prefix
  const qName = typ.quote.name
  const F = (table: Table) =>
    table.id.map((v) => {
      const col = table.columns[v]
      const dbType = typ.dbType[col.props.dbType] || col.props.dbType
      return `${qPrefix}${
        table.dbName
      }_${v}${qName} ${dbType.toUpperCase()} NOT NULL`
    })

  const U = (table: Table) => table.id.map((v) => table.dbName + '_' + v)

  return sqlDiff
    .tbl(mapName)
    .create(
      `${F(tbl[0]).concat(F(tbl[1])).join(',\n')}, UNIQUE (${AddQuote(
        U(tbl[0]).concat(U(tbl[1])),
        sqlDiff.keyword.quote.name
      ).toString()})`
    )
}

export function CreateAllTblSqls(
  config: DbConfig,
  tbls: Tables | FlatTables,
  createArr?: TableView[]
) {
  const flatTbls = FlatTables(tbls)
  const tblCreate = {
    create: <string[]>[],
    alter: <string[]>[],
    mapTable: {},
  }

  const addTbls = Object.keys(
    createArr
      ? createArr.reduce((_, v) => ((_[v.jsName] = v), _), {})
      : flatTbls
  )

  for (const v of addTbls) {
    const sql = CreateTblSql(config, flatTbls, v)
    tblCreate.create.push(...sql.create)
    tblCreate.alter.push(...sql.alter)
    Object.assign(tblCreate.mapTable, sql.mapTable)
  }

  // 创建映射表
  for (const k in tblCreate.mapTable) {
    tblCreate.create.push(CreateMapTblSql(config, k, tblCreate.mapTable[k]))
  }
  // 创建表语句
  return {
    total: tblCreate.create.length,
    sqls: tblCreate.create.concat(tblCreate.alter).join(';\n\n'),
  }
}

export function DbDiffSqls(currdb, prevDb) {
  const curr = FlatTables(currdb.tables)
  const prev = FlatTables(prevDb.tables)
  const diff = <DbMigrate>ormDiff(curr, prev)

  const rtn = {
    create: [],
    alter: [],
    remove: [],
  }

  if (notEmpty(diff)) {
    if (diff.add) {
      rtn.create.push(CreateAllTblSqls(currdb.config, curr, diff.add).sqls)
    }

    if (diff.remove) {
      diff.remove.forEach((v) => {
        const sql = RemoveTblSql(currdb.config, prev, v.jsName)
        rtn.remove.push(...sql.remove)
        rtn.alter.push(...sql.alter)
      })
    }

    if (diff.alter) {
      const sql = AlterTblSql(currdb.config, curr, diff.alter)
      rtn.create.push(...sql.create)
      rtn.remove.push(...sql.remove)
      rtn.alter.push(...sql.alter)
    }
  }

  return [...new Set([...rtn.create, ...rtn.alter, ...rtn.remove])].join(';\n')
}

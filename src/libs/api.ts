/// <reference types="../types" />

import fs from 'fs'
import path from 'path'
import * as Cst from './constant'
import {
  FlatTables,
  MapTblName,
  AddQuote,
  Deprecated,
  MkdirsSync,
  isEmpty,
  checkApps,
} from './common'
import * as parser from './ts-parser'
import {
  transaction,
  transactionClient,
  classHeadClient,
  apiBridge,
  tableQuery,
  classFooterClient,
  sqlRawServer,
  constructor,
  apiIndexClient,
  fnTpl,
  reqInstTpl,
  reqInitValueTpl,
} from './templates'

const templatePath = `../../templates`

// Generate enum types
const EnumType = (enums: Enums) => {
  let rtn = ``
  for (const k in enums)
    rtn += `\n  ${k}: ${enums[k].values.map((v) => "'" + v + "'").join(' | ')}`

  return `export type $Enum = {${rtn}\n}`
}

// Generate enum constants
const EnumConst = (enums: Enums) => {
  let rtn = []
  for (const k in enums)
    rtn.push(
      `\n  ${k}: [ ${enums[k].values.map((v) => "'" + v + "'").join(', ')} ]`
    )

  return `\n\nconst $Enum = {${rtn.join(`,`)}\n}`
}

const tblQueries = (
  tables: Tables,
  dbVar: string,
  api: 'server' | 'transaction' | 'client' | 'transaction_client'
) => {
  const TblQuery = (tbl: Table) => {
    const tblName = tbl.jsName
    const query = (Q: string) =>
      `async <T extends ${
        ['count', 'countDistinct'].includes(Q)
          ? `${tblName}_aggregate_args`
          : `${tblName}_${
              Cst.aggregates.includes(Q) ? 'aggregateNumber' : Q
            }_args`
      }>(args${Cst.argOpts.includes(Q) ? '?' : ''}: ${
        ['count', 'countDistinct'].includes(Q)
          ? `$SelectSubset<T,${tblName}_aggregate_args>`
          : `$SelectSubset<T, ${tblName}_${
              Cst.aggregates.includes(Q) ? 'aggregateNumber' : Q
            }_args>`
      }): Promise<{data?: ${
        Cst.aggregates.includes(Q)
          ? 'number'
          : ['deleteMany', 'updateMany'].includes(Q)
          ? 'number'
          : `$CheckSelect<T, ${
              'findMany' === Q ? 'Array<' + tblName + '>' : tblName
            }, ${
              'findMany' === Q
                ? 'Array<' + tblName + '_payload<T>>>'
                : tblName + '_payload<T>>'
            }`
      } , sql?: string[], error?: string}> => ${
        'server' === api
          ? tableQuery(Q, tblName)
          : `await ${api.endsWith('client') ? `$.${dbVar}.req` : '$Handle'}${
              'transaction' === api ? '( trx )' : ''
            }({
            query: '${Q}', args, ${
              api.endsWith('client')
                ? `kind: 'orm', dbVar: '${dbVar}', method: [${AddQuote(
                    [...tbl.namespace, tbl.name],
                    "'"
                  ).toString()}${Cst.aggregates.includes(Q) ? ", '$'" : ''}]`
                : `table: ${AddQuote(tblName, "'")}`
            } })`
      }`
    const aggr = () => `{
  ${Cst.aggregates.map((v) => `${v}: ${query(v)}`).join(`,\n`)}
    }`

    return Cst.queries
      .map((v) => `${v}: ${v === '$' ? aggr() : query(v)}`)
      .join(`,\n`)
  }
  const tblIter = (subTbls: Tables) =>
    Object.keys(subTbls).reduce((_, v) => {
      _.push(tblApi(<Tables>subTbls[v], v, ':'))
      return _
    }, <string[]>[])

  const tblApi = (tbl: TableItem, key: string, spt: '=' | ':') => `${
    (<Table>tbl).props?.deprecated
      ? Deprecated((<Table>tbl).props.deprecated)
      : ``
  }${key} ${spt} {
  ${typeof tbl.kind === 'string' ? TblQuery(<Table>tbl) : tblIter(<Tables>tbl)}
}`

  return Object.keys(tables)
    .reduce(
      (_, v) => (
        _.push(
          tblApi(<Table>tables[v], v, api.startsWith('transaction') ? ':' : '=')
        ),
        _
      ),
      <string[]>[]
    )
    .join(`${api.startsWith('transaction') ? ',' : ''}\n\n`)
}

// Generate frontend and backend constructors
const classServer = (db: Db, dbVar: string) => {
  const { config, tables } = db
  return `\n\nexport const ${dbVar} = new (class  {
  ${constructor(config)}
  ${transaction(tblQueries(tables, dbVar, 'transaction'))}
  ${tblQueries(tables, dbVar, 'server')}
  ${sqlRawServer(dbVar)}
})()`
}

const classClient = (db: Db, dbVar: string) => {
  return `${classHeadClient(dbVar)}
  /*
   * The transaction API of this frontend is just to imitate the backend writing method,
   * so that the code can be migrated to the backend in the future to reduce changes
   */
  ${transactionClient(tblQueries(db.tables, dbVar, 'transaction_client'))}
  ${tblQueries(db.tables, dbVar, 'client')}
  ${classFooterClient(dbVar)}
  `
}

// Generate table annotations and types
const Orm = (tables: { [k: string]: Table | View }) => {
  // Annotations of tables
  const Att: Annotates = {}
  // Definitions for all required types of each table
  const typeDefine: {
    [k in
      | 'unique'
      | 'check'
      | 'optional'
      | 'scalar'
      | 'onTime'
      | 'foreign'
      | 'table']: { [k: string]: string[] }
  } = {
    unique: {},
    check: {},
    optional: {},
    scalar: {},
    onTime: {},
    foreign: {},
    table: {},
  }
  // Initialize all tables
  for (const k in tables) {
    const tbl = tables[k]
    Att[tbl.jsName] = { columns: {}, scalarColumns: [], foreignKeys: [] }
    for (const td in typeDefine)
      typeDefine[td][tbl.jsName] = typeDefine[td][tbl.jsName] || []
  }

  for (const k in tables) {
    const tbl = tables[k]
    if ('view' === tbl.kind) {
      continue
    }

    Object.assign(Att[tbl.jsName], {
      dbName: tbl.dbName,
      id: tbl.id,
      uniques: tbl.uniques,
    })

    tbl.uniques.forEach((v) => {
      if (1 === v.length) {
        typeDefine.unique[tbl.jsName].push(
          `{${v[0]}: $TB['${tbl.jsName}']['${v[0]}']}`
        )
      } else {
        typeDefine.unique[tbl.jsName].push(
          `{${v
            .map((v2: string) => `  ${v2}: $TB['${tbl.jsName}']['${v2}']`)
            .join('\n')}}`
        )
      }
    })
    for (const k2 in tbl.columns) {
      const col = (<Table>tbl).columns[k2]
      const colName = col.jsName
      let [typeTbl, relColOpt] = col.props.jsType.split('.')
      // Default
      let colDefine = `${col.jsName}${
        'required' === col.optional ? '' : '?'
      }: ${typeTbl}`
      Att[tbl.jsName].columns[colName] = Object.assign(
        Att[tbl.jsName].columns[colName] || {},
        {
          name: colName,
        }
      )
      // Is relation field
      if (relColOpt) {
        const relTbl = tables[typeTbl]
        const relColName = relColOpt.match(/^\w+/)![0]
        const relCol = relTbl.columns[relColName]

        Object.assign(Att[tbl.jsName].columns[colName], {
          type: typeTbl,
          optional: col.optional,
        })

        Att[relTbl.jsName].columns[relColName] = {
          ...(Att[relTbl.jsName].columns[relColName] || {}),
          type: tbl.jsName,
          optional: relCol.optional,
        }

        // Is foreign key field
        if (col.props.foreign) {
          typeDefine.table[tbl.jsName].push(
            `${col.jsName}${
              'optional' === col.optional ? '?' : ''
            }: $Relation<'${typeTbl}', '${relColName}', 'toOne'>`
          )
          typeDefine.foreign[tbl.jsName] = typeDefine.foreign[
            tbl.jsName
          ].concat(col.props.foreign.keys)

          Att[tbl.jsName].foreignKeys?.push(...col.props.foreign.keys)
          Att[tbl.jsName].columns[colName].relation = {
            kind: 'foreign',
            relColumn: relColName,
            keys: col.props.foreign.keys,
            references: col.props.foreign.references,
          }

          // Add primary keys
          typeDefine.table[typeTbl].push(
            `${relColName}${
              'required' !== relCol.optional ? '?' : ''
            }: $Relation<'${tbl.jsName}', '${colName}', '${
              'array' === relCol.optional ? 'toMany' : 'toOne'
            }'>`
          )
          Att[relTbl.jsName].columns[relColName].relation = {
            kind: 'primary',
            toOne: 'array' !== relCol.optional,
            relColumn: colName,
            keys: col.props.foreign.keys,
            references: col.props.foreign.references,
          }
        } // Is many-to-many field
        else if (relColOpt.endsWith(']')) {
          typeDefine.table[tbl.jsName].push(
            `${col.jsName}?: $Relation<'${typeTbl}', '${relColName}', 'M2M'>`
          )
          const mapTable = MapTblName(
            tbl.dbName,
            col.dbName,
            relTbl.dbName,
            relCol.dbName
          )

          Object.assign(Att[tbl.jsName].columns[colName], {
            optional: 'optional',
            relation: {
              kind: 'many',
              relColumn: relColName,
              mapTable,
            },
          })
        }
      }
      // Is scalar field
      else {
        Att[tbl.jsName].scalarColumns!.push(colName)

        Object.assign(Att[tbl.jsName].columns[colName], {
          dbName: col.dbName,
          type: col.type,
          jsType: col.props.jsType,
          dbType: col.props.dbType,
          optional: col.optional,
        })

        if ('required' !== col.optional)
          typeDefine.optional[tbl.jsName].push(colName)
        switch (col.type) {
          case 'Date':
            if (col.props.createdAt || col.props.updatedAt)
              typeDefine.onTime[tbl.jsName].push(colName)
            break
          case 'int':
          case 'float':
            colDefine = `${col.jsName}${
              'required' === col.optional ? '' : '?'
            }: number`
            break
          case 'id':
            if (['cuid', 'uuid'].includes(col.props.jsType))
              colDefine = `${col.jsName}${
                'required' === col.optional ? '' : '?'
              }: string`
            break
          case 'enum':
            colDefine = `${colName}${
              'required' === col.optional ? '' : '?'
            }: $Enum['${col.props.jsType}']`
            break
        }
        if (col.props.deprecated) {
          colDefine = `${Deprecated(col.props.deprecated)}${colDefine}`
          col.optional = 'optional'
        }
        typeDefine.scalar[tbl.jsName].push(colDefine)
        typeDefine.table[tbl.jsName].push(colDefine)
      }
    }
  }

  return { typeDefine, Att }
}
// Generate table types
const generateTsType = (orm) => {
  const tsType = []
  for (const table in orm.Att) {
    let tableUniqueWhere = `export type ${table}_unique_where = {\n`
    const tableOrderByFields = []
    const tableTypeFields = []
    const tableSelectTypeFields = []
    const tableWhereFields = []
    const tableInsertFields = []
    const tableUpdateFields = []
    const tableUpdateManyFields = []
    const tableAggregateNumberFields = []
    const tableAggregateFields = []
    const payloadFields = []
    for (const c in orm.Att[table].columns) {
      if (orm.Att[table].columns[c].relation) {
        switch (orm.Att[table].columns[c].relation.kind) {
          case 'foreign':
            tableSelectTypeFields.push(
              `${c}?: boolean | {
                select: Omit<${orm.Att[table].columns[c].type}_select, '${orm.Att[table].columns[c].relation.relColumn}'>
              } | Omit<${orm.Att[table].columns[c].type}_select, '${orm.Att[table].columns[c].relation.relColumn}'>`
            )
            tableWhereFields.push(
              `${c}?: ${orm.Att[table].columns[c].type}_where ${
                orm.Att[table].columns[c].optional !== 'required'
                  ? '| null'
                  : ''
              }`
            )
            tableInsertFields.push(`${c}${
              orm.Att[table].columns[c].optional !== 'required' ? '?' : ''
            }: {
              insert?: Omit<${orm.Att[table].columns[c].type}_insert, ${orm.Att[
              table
            ].columns[c].relation.keys
              .map((v) => `'${v}'`)
              .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
              connect?: ${orm.Att[table].columns[c].type}_unique_where
            }`)
            tableUpdateFields.push(`${c}?: {
                insert?: Omit<${
                  orm.Att[table].columns[c].type
                }_insert,  ${orm.Att[table].columns[c].relation.keys
              .map((v) => `'${v}'`)
              .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                connect?: ${orm.Att[table].columns[c].type}_unique_where
                disconnect?: ${orm.Att[table].columns[c].type}_unique_where
                update?: Omit<${
                  orm.Att[table].columns[c].type
                }_update,  ${orm.Att[table].columns[c].relation.keys
              .map((v) => `'${v}'`)
              .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                delete?: ${orm.Att[table].columns[c].type}_unique_where
                upsert?: {
                    insert:  Omit<${
                      orm.Att[table].columns[c].type
                    }_insert,  ${orm.Att[table].columns[c].relation.keys
              .map((v) => `'${v}'`)
              .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                    update:  Omit<${
                      orm.Att[table].columns[c].type
                    }_update,  ${orm.Att[table].columns[c].relation.keys
              .map((v) => `'${v}'`)
              .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                }
            }`)
            payloadFields.push(
              `P extends '${c}' ? ${orm.Att[table].columns[c].type}_payload<('select' extends keyof S ? S['select'] : S)[P]> | null : `
            )
            break
          case 'primary':
            if (orm.Att[table].columns[c].relation.toOne) {
              tableSelectTypeFields.push(
                `${c}?: boolean | {
                  select: Omit<${orm.Att[table].columns[c].type}_select, '${orm.Att[table].columns[c].relation.relColumn}'>
                } | Omit<${orm.Att[table].columns[c].type}_select, '${orm.Att[table].columns[c].relation.relColumn}'>`
              )
              tableWhereFields.push(
                `${c}?: ${orm.Att[table].columns[c].type}_where ${
                  orm.Att[table].columns[c].optional !== 'required'
                    ? '| null'
                    : ''
                }`
              )
              tableInsertFields.push(`${c}${
                orm.Att[table].columns[c].optional !== 'required' ? '?' : ''
              }: {
                insert?: Omit<${
                  orm.Att[table].columns[c].type
                }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                connect?: ${orm.Att[table].columns[c].type}_unique_where
              }`)
              tableUpdateFields.push(`${c}?: {
                  insert?: Omit<${
                    orm.Att[table].columns[c].type
                  }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                  connect?: ${orm.Att[table].columns[c].type}_unique_where
                  disconnect?: ${orm.Att[table].columns[c].type}_unique_where
                  update?: Omit<${
                    orm.Att[table].columns[c].type
                  }_update,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                  delete?: ${orm.Att[table].columns[c].type}_unique_where
                  upsert?: {
                      insert:  Omit<${
                        orm.Att[table].columns[c].type
                      }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                      update:  Omit<${
                        orm.Att[table].columns[c].type
                      }_update,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                  }
              }`)
              payloadFields.push(
                `P extends '${c}' ? ${orm.Att[table].columns[c].type}_payload<('select' extends keyof S ? S['select'] : S)[P]> | null : `
              )
            } else {
              tableSelectTypeFields.push(
                `${c}?: boolean | ${orm.Att[table].columns[c].type}_findMany_args | ${orm.Att[table].columns[c].type}_select`
              )
              tableWhereFields.push(
                `${c}?: {
                  every?: ${orm.Att[table].columns[c].type}_where
                  some?: ${orm.Att[table].columns[c].type}_where
                  none?: ${orm.Att[table].columns[c].type}_where
                }`
              )
              tableInsertFields.push(`${c}?: {
                insert?: $Enumerable<Omit<${
                  orm.Att[table].columns[c].type
                }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${
                orm.Att[table].columns[c].relation.relColumn
              }'>>
                connect?: $Enumerable<${
                  orm.Att[table].columns[c].type
                }_unique_where>
              }`)
              tableUpdateFields.push(`${c}?: {
                  insert?: $Enumerable<Omit<${
                    orm.Att[table].columns[c].type
                  }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${
                orm.Att[table].columns[c].relation.relColumn
              }'>>
                  connect?: $Enumerable<${
                    orm.Att[table].columns[c].type
                  }_unique_where>
                  disconnect?: $Enumerable<${
                    orm.Att[table].columns[c].type
                  }_unique_where>
                  delete?: $Enumerable<${
                    orm.Att[table].columns[c].type
                  }_unique_where>
                  upsert?: $Enumerable<{
                    where: ${orm.Att[table].columns[c].type}_unique_where
                    insert: Omit<${
                      orm.Att[table].columns[c].type
                    }_insert,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                    update: Omit<${
                      orm.Att[table].columns[c].type
                    }_update,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                  }>
                  update?: $Enumerable<{
                    where: ${orm.Att[table].columns[c].type}_unique_where
                    data: Omit<${
                      orm.Att[table].columns[c].type
                    }_update,  ${orm.Att[table].columns[c].relation.keys
                .map((v) => `'${v}'`)
                .join('|')} | '${orm.Att[table].columns[c].relation.relColumn}'>
                  }>
                  set?: $Enumerable<${
                    orm.Att[table].columns[c].type
                  }_unique_where>
                  updateMany?: {
                    where: ${orm.Att[table].columns[c].type}_where
                    data: ${orm.Att[table].columns[c].type}_updateMany
                  }
                  deleteMany?: ${orm.Att[table].columns[c].type}_where
              }`)
              payloadFields.push(
                `P extends '${c}' ? Array<${orm.Att[table].columns[c].type}_payload<('select' extends keyof S ? S['select'] : S)[P]>> : `
              )
            }
            break
          case 'many':
            tableSelectTypeFields.push(
              `${c}?: boolean | ${orm.Att[table].columns[c].type}_findMany_args | ${orm.Att[table].columns[c].type}_select`
            )
            tableWhereFields.push(
              `${c}?: {
                every?: ${orm.Att[table].columns[c].type}_where
                some?: ${orm.Att[table].columns[c].type}_where
                none?: ${orm.Att[table].columns[c].type}_where
              }`
            )
            tableInsertFields.push(`${c}?: {
              insert?: $Enumerable<Omit<${orm.Att[table].columns[c].type}_insert, '${orm.Att[table].columns[c].relation.relColumn}'>>
              connect?: $Enumerable<${orm.Att[table].columns[c].type}_unique_where>
            }`)
            tableUpdateFields.push(`${c}?: {
              insert?: $Enumerable<Omit<${orm.Att[table].columns[c].type}_insert, '${orm.Att[table].columns[c].relation.relColumn}'>>
              connect?: $Enumerable<${orm.Att[table].columns[c].type}_unique_where>
              disconnect?: $Enumerable<${orm.Att[table].columns[c].type}_unique_where>
              delete?: $Enumerable<${orm.Att[table].columns[c].type}_unique_where>
              upsert?: $Enumerable<{
                where: ${orm.Att[table].columns[c].type}_unique_where
                insert: Omit<${orm.Att[table].columns[c].type}_insert,  '${orm.Att[table].columns[c].relation.relColumn}'>
                update: ${orm.Att[table].columns[c].type}_update
              }>
              update?: $Enumerable<{
                where: ${orm.Att[table].columns[c].type}_unique_where
                data: Omit<${orm.Att[table].columns[c].type}_update,  '${orm.Att[table].columns[c].relation.relColumn}'>
              }>
              set?: $Enumerable<${orm.Att[table].columns[c].type}_unique_where>
              updateMany?: {
                where: ${orm.Att[table].columns[c].type}_where
                data: ${orm.Att[table].columns[c].type}_updateMany
              }
              deleteMany?: ${orm.Att[table].columns[c].type}_where
            }`)
            payloadFields.push(
              `P extends '${c}' ? Array<${orm.Att[table].columns[c].type}_payload<('select' extends keyof S ? S['select'] : S)[P]>> : `
            )
        }
      } else {
        let tableWhereFieldsString = ''
        switch (orm.Att[table].columns[c].type) {
          case 'enum':
            tableWhereFieldsString = `${c}?: $EnumFilter<${orm.Att[table].columns[c].jsType}> | ${orm.Att[table].columns[c].jsType}`
            break
          case 'string':
            tableWhereFieldsString = `${c}?: $StringFilter | ${
              orm.Att[table].columns[c].jsType
            } ${
              orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
            }`
            break
          case 'int':
          case 'float':
            tableWhereFieldsString = `${c}?: $IntFilter | ${
              orm.Att[table].columns[c].jsType
            } ${
              orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
            }`

            break
          case 'Date':
            tableWhereFieldsString += `${c}?: $DateFilter | ${
              orm.Att[table].columns[c].jsType
            } ${
              orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
            }`
            break
          case 'boolean':
            tableWhereFieldsString += `${c}?: $BoolFilter | ${
              orm.Att[table].columns[c].jsType
            } ${
              orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
            }`
            break
          case 'id':
            if (orm.Att[table].columns[c].jsType === 'string') {
              tableWhereFieldsString = `${c}?: $StringFilter | ${
                orm.Att[table].columns[c].jsType
              } ${
                orm.Att[table].columns[c].optional === 'required'
                  ? ''
                  : '| null'
              }`
            } else if (orm.Att[table].columns[c].jsType === 'number') {
              tableWhereFieldsString = `${c}?: $IntFilter | ${
                orm.Att[table].columns[c].jsType
              } ${
                orm.Att[table].columns[c].optional === 'required'
                  ? ''
                  : '| null'
              }`
            }
            break
          default:
            tableWhereFieldsString += `${c}?: ${
              orm.Att[table].columns[c].jsType
            } ${
              orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
            }`
        }
        tableTypeFields.push(
          `${c}?: ${orm.Att[table].columns[c].type === 'enum' ? `$Enum['${orm.Att[table].columns[c].jsType}']`: orm.Att[table].columns[c].jsType} ${
            orm.Att[table].columns[c].optional === 'required' ? '' : '| null'
          }`
        )
        tableSelectTypeFields.push(`${c}?: boolean`)
        tableWhereFields.push(tableWhereFieldsString)
        tableOrderByFields.push(`${c}?: $Order`)
        if (!orm.Att[table].foreignKeys.includes(c)) {
          tableInsertFields.push(
            `${c}${
              orm.Att[table].columns[c].optional !== 'required' ? '?' : ''
            }: ${orm.Att[table].columns[c].type === 'enum' ? `$Enum['${orm.Att[table].columns[c].jsType}']`: orm.Att[table].columns[c].jsType}`
          )
          tableUpdateFields.push(`${c}?: ${orm.Att[table].columns[c].type === 'enum' ? `$Enum['${orm.Att[table].columns[c].jsType}']`: orm.Att[table].columns[c].jsType}`)
        }
        tableUpdateManyFields.push(`${c}?: ${orm.Att[table].columns[c].type === 'enum' ? `$Enum['${orm.Att[table].columns[c].jsType}']`: orm.Att[table].columns[c].jsType}`)
        if (orm.Att[table].columns[c].jsType === 'number') {
          tableAggregateNumberFields.push(`'${c}'`)
        }
        tableAggregateFields.push(`'${c}'`)
      }
    }
    for (let u = 0; u < orm.Att[table].uniques.length; u++) {
      for (const f of orm.Att[table].uniques[u]) {
        tableUniqueWhere += `${f}: ${orm.Att[table].columns[f].jsType}\n`
      }
      tableUniqueWhere += `} `
      if (u !== orm.Att[table].uniques.length - 1) {
        tableUniqueWhere += ` | {\n`
      }
    }
    const tableType = `export type ${table} = {
      ${tableTypeFields.join('\n')}
    }`
    const tableSelectType = `export type ${table}_select = {
      '*'?: boolean
      ${tableSelectTypeFields.join('\n')}
    }`
    const tableWhere = `export type ${table}_where = {
      ${tableWhereFields.join('\n')}
      AND?: ${table}_where | ${table}_where[]
      OR?: ${table}_where | ${table}_where[]
      NOT?: ${table}_where | ${table}_where[]
    }`
    const tableOrderBy = `export type ${table}_orderBy = {
      ${tableOrderByFields.join('\n')}
    }`
    const tableInsert = `export type ${table}_insert = {
      ${tableInsertFields.join('\n')}
    }`
    const tableUpdate = `export type ${table}_update = {
      ${tableUpdateFields.join('\n')}
    }`
    const tableUpdateMany = `export type ${table}_updateMany = {
      ${tableUpdateManyFields.join('\n')}
    }`
    const tableAggregateNumber = `export type ${table}_aggregateNumber = never ${
      tableAggregateNumberFields.length ? '|' : ''
    } ${tableAggregateNumberFields.join('|')}`
    const tableAggregate = `export type ${table}_aggregate = '*' | ${tableAggregateFields.join(
      '|'
    )}`
    const tablePayload = `type ${table}_payload<
            S extends boolean | null | undefined | ${table}_args | ${table}_select,
            U = keyof S
              > = S extends true
                ? ${table}
            : S extends undefined
            ? never
            : S extends ${table}_args | ${table}_findMany_args | ${table}_select
            ? '*' extends Extract<keyof ('select' extends keyof S ? S['select'] : S), '*'>
            ?  {
                [P in (keyof ${table} | $TruthyKeys<Omit<('select' extends keyof S ? S['select'] : S), '*'>>)]: P extends keyof ${table}
                                ? ${table}[P]
                                : ${payloadFields.join('\n')}
                                never
              } : {
            [P in $TruthyKeys<('select' extends keyof S ? S['select'] : S)>]: P extends keyof ${table} ? ${table}[P]
                :${payloadFields.join('\n')}
           never }  : {[P in keyof ${table}]: ${table}[P]}`

    let tableFindOneArgs = `export type ${table}_findOne_args = {
                select?: ${table}_select | null 
                where: ${table}_unique_where
                sql?: boolean
            }`
    let tableFindFirstArgs = `export type ${table}_findFirst_args = {
                select?: ${table}_select | null 
                where?: ${table}_where 
                orderBy?: $Enumerable<${table}_orderBy>
                sql?: boolean
            }`
    let tableFindManyArgs = `export type ${table}_findMany_args = {
                select?: ${table}_select | null 
                where?: ${table}_where 
                orderBy?: $Enumerable<${table}_orderBy> 
                limit?: number
                offset?: number
                sql?: boolean
            }`
    let tableInsertArgs = `export type ${table}_insert_args = {
                select?: ${table}_select | null 
                data: ${table}_insert
                sql?: boolean
            }`
    let tableUpdateArgs = `export type ${table}_update_args = {
                select?: ${table}_select | null 
                where: ${table}_unique_where
                data: ${table}_update
                sql?: boolean
            }`
    let tableUpdateManyArgs = `export type ${table}_updateMany_args = {
                where?: ${table}_where
                data: ${table}_updateMany
                sql?: boolean
            }`
    let tableUpsertArgs = `export type ${table}_upsert_args = {
                where: ${table}_unique_where
                select?: ${table}_select | null 
                insert: ${table}_insert
                update: ${table}_update
                sql?: boolean
            }`
    let tableDeleteArgs = `export type ${table}_delete_args = {
                select?: ${table}_select | null 
                where: ${table}_unique_where
                sql?: boolean
            }`
    let tableDeleteManyArgs = `export type ${table}_deleteMany_args = {
                where: ${table}_where
                sql?: boolean
            }`
    let tableArgs = `type ${table}_args = {
      select?: ${table}_select | null
    }`
    let tableAggregateArgs = `type ${table}_aggregate_args = {
                select?: ${table}_aggregate
                where?: ${table}_where
                sql?: boolean
            }`
    let tableAggregateNumberArgs = `type ${table}_aggregateNumber_args = {
                select: ${table}_aggregateNumber
                where?: ${table}_where
                sql?: boolean
            }`
    tsType.push(tableType)
    tsType.push(tableSelectType)
    tsType.push(tableWhere)
    tsType.push(tableUniqueWhere)
    tsType.push(tableOrderBy)
    tsType.push(tableInsert)
    tsType.push(tableUpdate)
    tsType.push(tableUpdateMany)
    tsType.push(tableAggregateNumber)
    tsType.push(tableAggregate)
    tsType.push(tableFindOneArgs)
    tsType.push(tableFindFirstArgs)
    tsType.push(tableFindManyArgs)
    tsType.push(tableInsertArgs)
    tsType.push(tableUpdateArgs)
    tsType.push(tableUpdateManyArgs)
    tsType.push(tableUpsertArgs)
    tsType.push(tableDeleteArgs)
    tsType.push(tableDeleteManyArgs)
    tsType.push(tableAggregateArgs)
    tsType.push(tableAggregateNumberArgs)
    tsType.push(tableArgs)
    tsType.push(tablePayload)
  }
  return tsType
}
// Generate frontend and backend api
async function DbApi(ast: Ast) {
  // Packages needed to be imported
  let serverApi = fs.readFileSync(
    path.join(__dirname, `${templatePath}/import`),
    'utf-8'
  )
  // Generate enum types
  let clientApi =
    EnumType(ast.enums) +
    // Type definition
    require(`${templatePath}/typedefine`)
  // Generate the types of each table
  let dbType = {
    TB: <string[]>[],
    UN: <string[]>[],
    FK: <string[]>[],
    CU: <string[]>[],
    NL: <string[]>[],
    anno: {},
  }
  let tsType = []
  for (const k in ast.dbs) {
    const orm = Orm(FlatTables(ast.dbs[k].tables))

    const tmp: string[] = []
    for (const k2 in orm.typeDefine.table) {
      tmp.push(`  ${k2}: {\n${orm.typeDefine.table[k2].join('\n')}\n  }`)
    }
    dbType.TB.push(...tmp)

    tmp.length = 0
    for (const k2 in orm.typeDefine.unique) {
      const uni = orm.typeDefine.unique[k2]
      tmp.push(`  ${k2}: ${uni.join(' | ') || 'never'}\n`)
    }
    dbType.UN.push(...tmp)

    for (const v2 of ['foreign', 'onTime', 'optional']) {
      tmp.length = 0
      for (const k3 in orm.typeDefine[v2]) {
        tmp.push(
          `  ${k3}: ${
            orm.typeDefine[v2][k3].map((v3: string) => `'${v3}'`).join(' | ') ||
            'never'
          }`
        )
      }
      dbType[
        <'FK' | 'CU' | 'NL'>{ foreign: 'FK', onTime: 'CU', optional: 'NL' }[v2]
      ].push(...tmp)
    }
    // annotation
    Object.assign(dbType.anno, orm.Att)

    tsType = generateTsType(orm)
  }

  serverApi += clientApi +=
    '\n\nexport ' +
    ['TB', 'UN', 'FK', 'CU', 'NL']
      .map((v) => `type $${v} = {\n${dbType[v].join('\n')}}`)
      .join('\n\n')
  serverApi += '\n\n' + tsType.join('\n\n')
  clientApi += '\n\n' + tsType.join('\n\n')
  serverApi += `\n\n${fs.readFileSync(
    path.join(__dirname, `${templatePath}/annotation`),
    'utf-8'
  )} = ${JSON.stringify(dbType.anno, null, 2)}`
  // Backend enum constants
  serverApi += EnumConst(ast.enums)
  // Table processing logic
  serverApi += fs.readFileSync(
    path.join(__dirname, `${templatePath}/handle`),
    'utf-8'
  )
  // Handle interface
  serverApi += fs.readFileSync(
    path.join(__dirname, `${templatePath}/handle-server`),
    'utf-8'
  )
  // Add frontend base class
  clientApi +=
    '\n\n' +
    fs.readFileSync(
      path.join(__dirname, `${templatePath}/client-request`),
      'utf-8'
    )
  // Generate the class of access table
  for (const k in ast.dbs) {
    // Variables set by the frontend request header
    const db = ast.dbs[k]
    serverApi += classServer(db, k)
    clientApi += classClient(db, k)
  }
  serverApi += apiBridge(Object.keys(ast.dbs))
  // Generate frontend proxy for node package
  // clientApi += await parser.pkgProxy(ast.imports)

  return { serverApi, clientApi }
}

export default async function (acaDir: AcaDir, config: Config, ast: Ast) {
  checkApps(acaDir, config)
  const resolveAcaDir = path.resolve(acaDir)
  const serverApps = config.serverApps
  const clientApps = config.clientApps
  const dbApi = await DbApi(ast)
  const clientRPCApis = {}

  const nsRPCTpl = (name: string) => `export namespace ${name} {
    ${clientRPCApis[name]}
  }`

  if (isEmpty(serverApps)) {
    throw `At least one server-side app needs to be created, please create it first using the command: aca server XXX`
  }

  for (const k in serverApps) {
    const serverConfig = config.serverApps[k]
    const resolveApiDir = path.join(
      resolveAcaDir,
      k,
      serverConfig.apiDir ??
        path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
    )
    const apiIndex = path.join(resolveApiDir, Cst.ApiIndex)
    const RPCDir = path.join(resolveApiDir, Cst.ServerRPCDir)
    if (!fs.existsSync(RPCDir)) MkdirsSync(RPCDir)
    fs.writeFileSync(apiIndex, dbApi.serverApi)
    // Write index.ts of remote function and frontend proxy
    clientRPCApis[k] = await parser.RPCProxy(k, RPCDir)
  }

  for (const k in clientApps) {
    const clientConfig = config.clientApps[k]
    const allowRPCs = clientApps[k]?.allowRPCs || Object.keys(serverApps)
    const RPCs = allowRPCs.filter((v) =>
      clientRPCApis[v] !== undefined ? true : false
    )
    const RPCApis = RPCs.map((v) => (clientRPCApis[v] ? nsRPCTpl(v) : '')).join(
      '\n\n'
    )
    const reqInstance = () => {
      const fnStr = RPCs.map((v) => `${v}: ${reqInitValueTpl}`).join(',\n')
      const dbStr = Object.keys(ast.dbs)
        .map((v) => `${v}: ${reqInitValueTpl}`)
        .join(',\n')

      return reqInstTpl(fnStr, dbStr)
    }

    const clientApi = `${dbApi.clientApi}\n
${reqInstance()}
${fnTpl(RPCApis)}
`
    const apiDir = path.join(
      k,
      clientConfig.apiDir ??
        path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
    )
    const api = path.join(resolveAcaDir, apiDir, Cst.ClientApi)
    const apiIndex = path.join(resolveAcaDir, apiDir, Cst.ClientApiIndex)

    if (!fs.existsSync(path.join(resolveAcaDir, apiDir)))
      MkdirsSync(path.join(resolveAcaDir, apiDir))
    fs.writeFileSync(api, clientApi)
    if (!fs.existsSync(apiIndex)) {
      fs.writeFileSync(apiIndex, apiIndexClient(Object.keys(ast.dbs), RPCs))
    }
  }
}

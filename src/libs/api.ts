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
    const tblType = tbl.jsName.replace(/_/g, '.')
    const query = (Q: string) =>
      `async (args${Cst.argOpts.includes(Q) ? '?' : ''}: ${tblType}.${
        Cst.aggregates.includes(Q) ? `$.${Q}` : Q === 'delete' ? 'del' : Q
      }): Promise<{data?: ${
        Cst.aggregates.includes(Q)
          ? 'number'
          : ['deleteMany', 'updateMany'].includes(Q)
          ? 'number'
          : `${
              'findMany' === Q
                ? `Array<{[P in keyof ${tblType}]?: ${tblType}[P]}>`
                : `{[P in keyof ${tblType}]?: ${tblType}[P]}`
            }`
      } , sql?: string[], error?: string, ${'findMany' === Q ? `count?: number`: ''}}> => ${
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

const namespaceType = (db: Db, dbVar: string) => {
  const { tables } = db
  return `\n\nexport namespace ${dbVar} {
          ${generateTsType(tables)}
  }`
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
    [k in 'unique' | 'check' | 'scalar' | 'onTime' | 'foreign' | 'table']: {
      [k: string]: string[]
    }
  } = {
    unique: {},
    check: {},
    scalar: {},
    onTime: {},
    foreign: {},
    table: {},
  }
  // Initialize all tables
  for (const k in tables) {
    const tbl = tables[k]
    Att[tbl.jsName] = { columns: {}, scalarColumns: [], foreignKeys: [], updatedAtColumns: [] }
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

        switch (col.type) {
          case 'Date':
            if (col.props.updatedAt) {
              typeDefine.onTime[tbl.jsName].push(colName)
              Att[tbl.jsName].updatedAtColumns.push(colName)
            }
            colDefine = `${col.jsName}${
              'required' === col.optional ? '' : '?'
            }: Date | string`
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
        if (
          'required' !== col.optional &&
          col.props.default === undefined &&
          !col.props.isId &&
          !col.props.createdAt &&
          !col.props.updatedAt
        )
          colDefine += ' | null'
        typeDefine.scalar[tbl.jsName].push(colDefine)
        typeDefine.table[tbl.jsName].push(colDefine)
      }
    }
  }

  return { typeDefine, Att }
}
// Generate table types
const generateTsType = (tables) => {
  function titleCase(str) {
    const newStr = str.slice(0, 1).toUpperCase() + str.slice(1)
    return newStr
  }
  const TblType = (columns, uniques) => {
    const query = (Q) => {
      const fields: any = Object.values(columns)
      switch (Q) {
        case 'scalar':
          return fields
            .filter((v) => !v.isRelation)
            .map(
              (v) => `${v.fieldName}${v.required}: ${v.fieldType}${v.isArray}`
            )
            .join('\n')
        case 'orderBy':
          return fields
            .filter((v) => !v.isRelation)
            .map((v) => `${v.fieldName}?:  $Order`)
            .join('\n')
        case 'where':
          return [
            `AND?: $Enumerable<where>`,
            `OR?: $Enumerable<where>`,
            `NOT?: $Enumerable<where>`,
            ...fields
            .map(
              (v) =>
                `${v.fieldName}?: ${
                  v.isRelation
                    ? v.isArray
                      ? `{
                    every?: Omit<${v.fieldType}.where, ${v.OmitSelectKeys}>
                    some?: Omit<${v.fieldType}.where, ${v.OmitSelectKeys}>
                    none?: Omit<${v.fieldType}.where, ${v.OmitSelectKeys}>
                }`
                      : `Omit<${v.fieldType}.where, ${v.OmitSelectKeys}>`
                    : `${
                        v.isEnum
                          ? `$EnumFilter<${v.fieldType}, ${v.isNull}>`
                          : `$${v.fieldType === 'Date | string' ? 'Date' :titleCase(v.fieldType)}Filter<${v.isNull}>`
                      } | ${v.fieldType} ${v.isNull ? ' | null' : ''}`
                }`
            )]
            .join('\n')
        case 'select':
          return `
            '*'?: boolean
            ${fields
              .map(
                (v) =>
                  `${v.fieldName}?: ${
                    v.isRelation
                      ? v.isArray
                        ? `Omit<${v.fieldType}.select, ${v.OmitSelectKeys}> | {
										where?: ${v.fieldType}.where
										orderBy?: ${v.fieldType}.orderBy
										limit?: number
                    offset?: number
										distinct?: '*' | $Enumerable<scalar>
										select?: Omit<${v.fieldType}.select, ${v.OmitSelectKeys}>
									}`
                        : `Omit<${v.fieldType}.select, ${v.OmitSelectKeys}> | {select?: Omit<${v.fieldType}.select, ${v.OmitSelectKeys}>}`
                      : 'boolean'
                  }`
              )
              .join('\n')}
          `
        case 'insertInput':
          return `
               
                    ${fields
                      .filter((v) => !v.isAuto && !v.isForeign)
                      .map(
                        (v) =>
                          `${v.fieldName}${v.required}: ${
                            v.isRelation
                              ? `{
                        insert?: ${
                          v.isArray
                            ? `$Enumerable<Omit<${v.fieldType}.insertInput, ${v.relationKeys}>>`
                            : `Omit<${v.fieldType}.insertInput, ${v.relationKeys}>`
                        }
                        connect?: ${
                          v.isArray
                            ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                            : `${v.fieldType}.uniqueWhere`
                        }
                        connectOrInsert?: ${
                          v.isArray
                            ? `$Enumerable<{
                              connect: ${v.fieldType}.uniqueWhere
                              insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                            }>`
                            : `{
                              connect: ${v.fieldType}.uniqueWhere
                              insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                            }`
                        }
                    }`
                              : v.fieldType
                          }`
                      )
                      .join('\n')}
               `
        case 'updateInput':
          return `
              ${fields
                .filter((v) => !v.isAuto && !v.isForeign)
                .map(
                  (v) =>
                    `${v.fieldName}?: ${
                      v.isRelation
                        ? `{
                  insert?: ${
                    v.isArray
                      ? `$Enumerable<Omit<${v.fieldType}.insertInput, ${v.relationKeys}>>`
                      : `Omit<${v.fieldType}.insertInput, ${v.relationKeys}>`
                  }
                  connect?: ${
                    v.isArray
                      ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                      : `${v.fieldType}.uniqueWhere`
                  }
                  connectOrInsert?: ${
                    v.isArray
                      ? `$Enumerable<{
                        connect: ${v.fieldType}.uniqueWhere
                        insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                      }>`
                      : `{
                        connect: ${v.fieldType}.uniqueWhere
                        insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                      }`
                  }
                  disconnect?: ${
                    v.isArray
                      ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                      // : `${v.fieldType}.uniqueWhere`
                      : 'boolean'
                  }
                  delete?: ${
                    v.isArray
                      ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                      // : `${v.fieldType}.uniqueWhere`
                      : 'boolean'
                  }
                  upsert?: ${
                    v.isArray
                      ? `$Enumerable<{
                      where: ${v.fieldType}.uniqueWhere
                      insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                      update: Omit<${v.fieldType}.updateInput, ${v.relationKeys}>
                  }>`
                      : `{
                      where: ${v.fieldType}.uniqueWhere
                      insert: Omit<${v.fieldType}.insertInput, ${v.relationKeys}>
                      update: Omit<${v.fieldType}.updateInput, ${v.relationKeys}>
                  }`
                  }
                  update?: ${
                    v.isArray
                      ? `$Enumerable<{
                      where: ${v.fieldType}.uniqueWhere
                      data: Omit<${v.fieldType}.updateInput, ${v.relationKeys}>
                  }>`
                      : `Omit<${v.fieldType}.updateInput, ${v.relationKeys}>`
                  }
                  ${
                    v.isArray
                      ? `
                      set?: $Enumerable<${v.fieldType}.uniqueWhere>
                      updateMany?: ${v.fieldType}.updateMany
                      deleteMany?: ${v.fieldType}.where
                  `
                      : ''
                  }
              }`
                        : v.fieldType
                    }`
                )
                .join('\n')}
          `
        case 'findOne':
          return `
                    where: uniqueWhere
                    select?: {[P in keyof select]?: select[P]}
                    sql?: boolean
                `
        case 'findFirst':
          return `
                    where?: where
                    orderBy?: orderBy
                    select?: {[P in keyof select]?: select[P]}
										distinct?: '*' | $Enumerable<scalar>
                    sql?: boolean
                `
        case 'findMany':
          return `
                    where?: where
                    orderBy?: orderBy
                    limit?: number
                    offset?: number
                    select?: {[P in keyof select]?: select[P]}
										distinct?: '*' | $Enumerable<scalar>
                    count?: boolean
                    sql?: boolean
                `
        case 'insert':
          return `
                data: $Enumerable<insertInput>
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'update':
          return `
                where: uniqueWhere
                data: updateInput
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'updateMany':
          return `
                where: where
                data: {
                    ${fields
                      .filter((v) => !v.isRelation && !v.isAuto)
                      .map((v) => `${v.fieldName}?: ${v.fieldType}`)
                      .join('\n')}
                }
                sql?: boolean
                `
        case 'upsert':
          return `
                where: uniqueWhere
                insert: insertInput
                update: updateInput
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'delete':
          return `
                where: uniqueWhere
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'deleteMany':
          return `
                where: where
                sql?: boolean
                `
        case 'count':
        case 'countDistinct':
          return `
                where?: where
                select: '*' | keyof scalar
                sql?: boolean
                `
        case 'sum':
        case 'sumDistinct':
        case 'avg':
        case 'avgDistinct':
        case 'max':
        case 'mix':
          return `
                where?: where
                select: ${
                  fields.filter((v) => v.fieldType === 'number').length
                    ? fields
                        .filter((v) => v.fieldType === 'number')
                        .map((v) => `'${v.fieldName}'`)
                        .join('|')
                    : 'never'
                }
                sql?: boolean
                `
      }
    }
    const aggr = () => `
        ${Cst.aggregates
          .map(
            (v) => `export type ${v} = {
                ${query(v)} 
                }`
          )
          .join(`\n`)}
    `
    const uniqueWhere =
      `export type uniqueWhere =` +
      uniques
        .map(
          (u) => `{
            ${u.map((v) => `${v}: ${columns[v].fieldType}`)}
          }`
        )
        .join(' | ')
    const queries = ['where', 'scalar', 'orderBy', 'select', 'insertInput', 'updateInput', ...Cst.queries]
      .map(
        (v) => `export ${v === '$' ? 'namespace' : 'type'} ${
          v === 'delete' ? 'del' : v
        } ${v === '$' ? '' : '='} {
         ${v === '$' ? aggr() : query(v)}
        }`
      )
      .join(`\n`)
    return [uniqueWhere, queries].join(`\n`)
  }
  const tblIter = (subTbls) =>
    Object.keys(subTbls)
      .reduce((_, v) => {
        _.push(tblTypeApi(subTbls[v], v))
        return _
      }, [])
      .join(`\n`)
  const tblTypeApi = (tbl, key) => {
    const columns = {}
    const foreign = []
    for (const k in tbl.columns) {
      const col = tbl.columns[k]
      let [typeTbl, relColOpt] = col.props.jsType.split('.')
      if (col.type === 'enum') typeTbl = `$Enum['${typeTbl}']`
      if (col.type === 'Date') typeTbl = `Date | string`
      columns[col.jsName] = {
        fieldName: col.jsName,
        isEnum: col.type === 'enum' ? true : false,
        fieldType:
          typeTbl.endsWith(']') && col.type !== 'enum'
            ? typeTbl.slice(0, -2)
            : typeTbl,
        required: col.optional === 'required' ? '' : '?',
        isRelation: false,
        isAuto: false,
        isNull: false,
        isForeign: foreign.includes(col.jsName) ? true : false,
        isArray: col.optional === 'array' ? '[]' : '',
        relationKeys: 'never',
        OmitSelectKeys: 'never',
      }
      if (col.props.createdAt || col.props.updatedAt) {
        columns[col.jsName].isAuto = true
      }
      if (col.props.isId && !['string', 'int'].includes(col.props.idType)) {
        columns[col.jsName].isAuto = true
      }
      if (
        !col.props.createdAt &&
        !col.props.updatedAt &&
        !col.props.isId &&
        col.optional !== 'required' &&
        col.props.default === undefined
      ) {
        columns[col.jsName].isNull = true
      }
      if (relColOpt) {
        columns[col.jsName].isRelation = true
        columns[col.jsName].fieldType = col.type.substring(
          0,
          col.type.lastIndexOf('.')
        )
        columns[col.jsName].isArray =
          relColOpt.endsWith(']') || col.optional === 'array' ? '[]' : ''
        columns[col.jsName].required =
          relColOpt.endsWith(']') || col.optional !== 'required' ? '?' : ''
        columns[col.jsName].relationKeys = `'${relColOpt.match(/^\w+/)[0]}'`

        if (col.props.foreign) {
          if (col.props.foreign.keys) {
            for (const k of col.props.foreign.keys) {
              if (columns[k]) {
                columns[k].isForeign = true
              }
              foreign.push(k)
            }
          }
          if (
            columns[col.jsName].fieldType
              .split('.')
              .reduce((_, v) => (_.columns ? _.columns[v] : _[v]), tables)
          ) {
            const relationTbl = columns[col.jsName].fieldType
              .split('.')
              .reduce((_, v) => (_.columns ? _.columns[v] : _[v]), tables)
            if (relationTbl) {
              const relationCol =
                relationTbl.columns[`${relColOpt.match(/^\w+/)[0]}`]
              if (relationCol && relationCol.optional !== 'array') {
                columns[col.jsName].OmitSelectKeys = `'${
                  relColOpt.match(/^\w+/)[0]
                }'`
              }
            }
          }
        } else if (!relColOpt.endsWith(']')) {
          columns[col.jsName].OmitSelectKeys = `'${relColOpt.match(/^\w+/)[0]}'`
        }
      }
    }
    return `
        ${
          typeof tbl.kind === 'string'
            ? `export type ${key} = {
            ${Object.values(columns)
              .map(
                (v: any) =>
                  `${v.fieldName}${v.required}:${v.fieldType}${v.isArray}`
              )
              .join('\n')}
        }`
            : ''
        }
        export namespace ${key} {
        ${
          typeof tbl.kind === 'string'
            ? TblType(columns, tbl.uniques)
            : tblIter(tbl)
        }
    }`
  }
  return Object.keys(tables)
    .reduce((_, v) => (_.push(tblTypeApi(tables[v], v)), _), [])
    .join(`\n\n`)
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

  serverApi +=
    EnumType(ast.enums) +
    // Type definition
    require(`${templatePath}/typedefine`)
  // Generate the types of each table
  let dbType = {
    TB: <string[]>[],
    UN: <string[]>[],
    FK: <string[]>[],
    CU: <string[]>[],
    anno: {},
  }
 
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

    for (const v2 of ['foreign', 'onTime']) {
      tmp.length = 0
      for (const k3 in orm.typeDefine[v2]) {
        tmp.push(
          `  ${k3}: ${
            orm.typeDefine[v2][k3].map((v3: string) => `'${v3}'`).join(' | ') ||
            'never'
          }`
        )
      }
      dbType[<'FK' | 'CU'>{ foreign: 'FK', onTime: 'CU' }[v2]].push(...tmp)
    }
    // annotation
    Object.assign(dbType.anno, orm.Att)
  }

  // serverApi += clientApi +=
  //   '\n\nexport ' +
  //   ['TB', 'UN', 'FK', 'CU']
  //     .map((v) => `type $${v} = {\n${dbType[v].join('\n')}}`)
  //     .join('\n\n')

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
    const tsType = namespaceType(db, k)
    serverApi += classServer(db, k)
    clientApi += classClient(db, k)
    serverApi += tsType
    clientApi += tsType
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
      const fetcher = clientApps[k]?.fetcher || 'fetch'
      fs.writeFileSync(apiIndex, apiIndexClient(Object.keys(ast.dbs), RPCs, fetcher))
    }
  }
}

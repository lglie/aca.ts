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
    const tblType = tbl.jsName.replace(/__/g, '.')
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
const generateTsType = (tables: Tables) => {
  const TblType = (columns, uniques: Array<Array<string>>) => {
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
        case 'where':
          return fields
            .filter((v) => v.fieldType !== 'object')
            .map(
              (v) =>
                `${v.fieldName}?: ${
                  v.isRelation
                    ? v.isArray
                      ? `{
                    every?: ${v.fieldType}.where
                    some?: ${v.fieldType}.where
                    none?: ${v.fieldType}.where
                }`
                      : `${v.fieldType}.where`
                    : `${
                        v.isEnum
                          ? `$enumFilter<${v.fieldType}>`
                          : `$${v.fieldType}Filter`
                      } | ${v.fieldType}`
                }`
            )
            .join('\n')
        case 'select':
          return `
            '*': boolean
            ${fields
              .map(
                (v) =>
                  `${v.fieldName}?: ${
                    v.isRelation
                      ? v.isArray
                        ? `${v.fieldType}.findMany | ${v.fieldType}.select`
                        : `Omit<${v.fieldType}.select, ${v.OmitSelectKeys}>`
                      : 'boolean'
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
                    orderBy?: {[P in keyof scalar]?: $Order}
                    select?: {[P in keyof select]?: select[P]}
                    sql?: boolean
                `
        case 'findMany':
          return `
                    where?: where
                    orderBy?: {[P in keyof scalar]?: $Order}
                    limit?: number
                    offset?: number
                    select?: {[P in keyof select]?: select[P]}
                    sql?: boolean
                `
        case 'insert':
          return `
                data: $Enumerable<{
                    ${fields
                      .map(
                        (v) =>
                          `${v.fieldName}${v.required}: ${
                            v.isRelation
                              ? `{
                        insert?: ${
                          v.isArray
                            ? `$Enumerable<Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>>`
                            : `Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>`
                        }
                        connect?: ${
                          v.isArray
                            ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                            : `${v.fieldType}.uniqueWhere`
                        }
                    }`
                              : v.fieldType
                          }`
                      )
                      .join('\n')}
                }>
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'update':
          return `
                where: uniqueWhere
                data: {
                    ${fields
                      .map(
                        (v) =>
                          `${v.fieldName}?: ${
                            v.isRelation
                              ? `{
                        insert?: ${
                          v.isArray
                            ? `$Enumerable<Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>>`
                            : `Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>`
                        }
                        connect?: ${
                          v.isArray
                            ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                            : `${v.fieldType}.uniqueWhere`
                        }
                        disconnect?: ${
                          v.isArray
                            ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                            : `${v.fieldType}.uniqueWhere`
                        }
                        delete?: ${
                          v.isArray
                            ? `$Enumerable<${v.fieldType}.uniqueWhere>`
                            : `${v.fieldType}.uniqueWhere`
                        }
                        upsert?: ${
                          v.isArray
                            ? `$Enumerable<{
                            where: uniqueWhere
                            insert: Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>
                            update: Omit<${v.fieldType}.update['data'], ${v.relationKeys}>
                        }>`
                            : `{
                            where: uniqueWhere
                            insert: Omit<${v.fieldType}.insert['data'], ${v.relationKeys}>
                            update: Omit<${v.fieldType}.update['data'], ${v.relationKeys}>
                        }`
                        }
                        update?: ${
                          v.isArray
                            ? `$Enumerable<{
                            where: ${v.fieldType}.uniqueWhere
                            data: Omit<${v.fieldType}.update['data'], ${v.relationKeys}>
                        }>`
                            : `{
                            where: ${v.fieldType}.uniqueWhere
                            data: Omit<${v.fieldType}.update['data'], ${v.relationKeys}>
                        }`
                        }
                        ${
                          v.isArray
                            ? `
                            set?: ${v.fieldType}.uniqueWhere
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
                }
                select?: {[P in keyof select]?: select[P]}
                sql?: boolean
                `
        case 'updateMany':
          return `
                where: where
                data: {
                    ${fields
                      .filter((v) => !v.isRelation)
                      .map((v) => `${v.fieldName}?: ${v.fieldType}`)
                      .join('\n')}
                }
                sql?: boolean
                `
        case 'upsert':
          return `
                where: uniqueWhere
                insert: insert['data']
                update: update['data']
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
                select: ${fields
									.filter((v) => v.fieldType === 'number').length ? fields
									.filter((v) => v.fieldType === 'number')
									.map((v) => `'${v.fieldName}'`)
									.join('|') : 'never'}
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
    const queries = ['scalar', 'where', 'select', ...Cst.queries]
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
    const columns: any = {}
    for (const k in tbl.columns) {
      const col = tbl.columns[k]
      let [typeTbl, relColOpt] = col.props.jsType.split('.')
      if (col.type === 'enum') typeTbl = `$Enum['${typeTbl}']`
      columns[col.jsName] = {
        fieldName: col.jsName,
        isEnum: col.type === 'enum' ? true : false,
        fieldType: typeTbl.endsWith(']') && col.type !== 'enum' ? typeTbl.slice(0, -2) : typeTbl,
        required: col.optional === 'required' ? '' : '?',
        isRelation: false,
        isArray: col.optional === 'array' ? '[]' : '',
        relationKeys: 'never',
        OmitSelectKeys: 'never',
      }
      if (relColOpt) {
        columns[col.jsName].isRelation = true
        columns[col.jsName].fieldType = col.type.substring(
          0,
          col.type.lastIndexOf('.')
        )
        columns[col.jsName].isArray =
          relColOpt.endsWith(']') || col.optional === 'array' ? '[]' : ''
        columns[col.jsName].required = relColOpt.endsWith(']') || col.optional === 'array' ? '?' : ''
        columns[col.jsName].relationKeys = `'${relColOpt.match(/^\w+/)[0]}'`
        columns[col.jsName].OmitSelectKeys = `'${relColOpt.match(/^\w+/)[0]}'`
        if (col.props.foreign) {
          columns[col.jsName].relationKeys +=
            '|' + col.props.foreign.keys.map((v) => `'${v}'`).join(' | ')
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
  // Generate the types of each table
  let dbType = {
    TB: <string[]>[],
    UN: <string[]>[],
    FK: <string[]>[],
    CU: <string[]>[],
    NL: <string[]>[],
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
  }

  serverApi += clientApi +=
    '\n\nexport ' +
    ['TB', 'UN', 'FK', 'CU', 'NL']
      .map((v) => `type $${v} = {\n${dbType[v].join('\n')}}`)
      .join('\n\n')

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
    serverApi += tsType
    clientApi += tsType
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

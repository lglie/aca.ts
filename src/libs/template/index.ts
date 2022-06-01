/// <reference types="../../types" />
import path from 'path'
import * as Cst from '../constant'
import SqlDiff from '../sql-diff'
export * from './faas'
export * from './faas-provider'
export * from './default'
export * from './index-koa'
export * from './index-express'
export * from './api-placeholder'
export * from './react-page'

export const clientClassHead = (dbVar: string) => `\n
export const ${dbVar} =new (class {
`

export const transaction = (queries: string) => `
async transaction() {
  const trx = await this.knex.transaction()

  return {
    async commit() {
      await trx.commit()
    },
    async rollback() {
      await trx.rollback()
    },
    isCompleted() {
      trx.isCompleted()
    },
    ${queries}
}
}
`

export const serverPkg = (
  name: string,
  drivers: string[],
  framework: 'koa' | 'express' | 'faas'
) => {
  const Drivers = {
    pg: `"pg": "",`,
    mysql: `"mysql": "",`,
    betterSqlite3: `"better-sqlite3": "7.5.1",`,
  }

  const Framework = {
    koa: {
      script: `"start": "node dist/index.js",`,
      dep: `"koa": "",
    "koa-body": "",
    "koa-cors": "",`,
      dev: ``,
      run: 'index',
    },
    express: {
      script: `"start": "node dist/index.js",`,
      dep: `"express": "",`,
      dev: ``,
      run: `index`,
    },
    faas: {
      script: ``,
      dep: ``,
      dev: `"koa": "",
    "koa-body": "",
    "koa-cors": "",`,
    },
    run: `.dev-serve`,
  }[framework]

  return `
{
  "name": "${name}",
  "description": "",
  "scripts": {
    ${Framework.script}
    "dev": "ts-node src/${Framework.run}"
  },
  "dependencies": {
    ${Framework.dep}
    ${drivers.map((v) => `${Drivers[v]}`).join('\n')}
    "cuid": "",
    "uuid": "",
    "knex": ""
  },
  "devDependencies": {
    ${Framework.dev}
    "@types/node": ""
  }
}
`
}

// Table query interface template
export const tableQuery = (query, tblName) => `{
  const trx = await this.knex.transaction()
  try {
    const rtn = await $Handle( trx )({ query: '${query}', table: '${tblName}', args })
    await trx.commit()
    return rtn
  } catch (err) {
    await trx.rollback()
    return { error: err.toString() }
  }
} `

//  Frontend footer template
export const classClientFooter = (dbVar: string) => `\n$ = {
    raw: async (args: string): Promise<{ data?: unknown; error?: string }> =>
    await $.${dbVar}.req({
      kind: 'raw',
      dbVar: '${dbVar}',
      args,
    }),
  }
})()`

// sql raw backend template
export const sqlRawServer = (dbVar) => `\n$ = {
  raw: async (args: string): Promise<{ data?: unknown; error?: string }> => {
    const trx = await this.knex.transaction()
    try {
      const data = (await trx.raw(args)).rows
      await trx.commit()
      // Rmeove whitespace before and after strings
      for (const v of data) {
        for (const k in v) {
          if (typeof v[k] === 'string') v[k] = v[k].trim()
        }
      }
      return { data }
    } catch (e) {
      await trx.rollback()
      return { error: e.toString() }
    }
  },
}
`

// Backend constructor
export const constructor = (config: DbConfig) => {
  const driver = config.connectOption.driver
  const sqlDiff = SqlDiff(driver)

  return `
private knex: Knex < any, unknown[] >
  constructor() {
  const driver = '${sqlDiff.keyword.fullName}'
  let connection = process.env['${
    config.connectOption.envConnect || ''
  }'] || ${JSON.stringify(config.connectOption.connect, null, 2)}

try {
  if (typeof connection == 'string') connection = JSON.parse(connection)
} catch (e) { }

this.knex = knex({
  client: driver,
  ${
    driver === 'pg'
      ? `pool: {
    min: 2,
    max: 6,
    propagateCreateError: false,
  },`
      : ''
  }
  connection: ${
    {
      pg: `typeof connection == 'string' ? require('pg-connection-string').parse(connection) : connection`,
      mysql: `connection`,
      betterSqlite3: `connection`,
    }[driver]
  }${driver === 'betterSqlite3' ? ',\nuseNullAsDefault: false,' : ''}
})
}
`
}

// Remote function frontend proxy template
export const RPCApi = (
  apiDir: string,
  name: string,
  params: string,
  rtnType: string,
  call: string,
  fn: string
) => `
export async function ${name} (${params}): ${
  rtnType.startsWith('Promise<') ? rtnType : `Promise<${rtnType}>`
} {
  return await $.$RPC.${apiDir}.req({
    kind: 'rpc',
    method: [${fn}],
    args: [${call}],
  })
} `

// Remote function namespace frontend proxy template
export const RPCNsApi = (name, body) => `
export namespace ${name} {
  ${body}
} `

export const apiBridge = (dbs: string[]) => `\n
export async function $ApiBridge(context: unknown, reqBody: $ApiBridge) {
  switch (reqBody.kind) {
    case 'rpc':
      return await reqBody.method.reduce((_: any, v: string) => _[v], $RPC)(
        context,
        ...(reqBody.args || [])
      )
    case 'orm':
      return await reqBody.method
        .reduce((_, v) => _[v], { ${dbs.toString()} }[reqBody.dbVar])
        [reqBody.query](reqBody.args)
    case 'raw':
      return await { ${dbs.toString()} }[reqBody.dbVar].$.raw(reqBody.args)
  }
}
`
// Summary of orm changes
export const remark = (date, comment) => ({
  date: new Date(date).toLocaleString(),
  id: date,
  comment,
})

const Faas = {
  lambda: `main_handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false
    const acaReq = await $ApiBridge(context, JSON.parse(event.body))`,
}

export const serverIndex = (
  faas: keyof typeof Faas
) => `import { $ApiBridge } from './api'

export const ${Faas[faas]}

  return acaReq
}
`

export const createdEcho = (name: string) => `
$ cd ${name}
1. Open .aca/config.json file for configuration:
${path.resolve(name, Cst.AcaConfig)}
  
2. Create a server-side app (at least one) and a client-side app in the current directory：
Create a server-side app using command：
$ aca server [dirname] --framework <framework or faas> (framework：koa, express, faas:amazon, azure, ali, tencent)
Create a client-side using command, internally call create-react-app to create a react app：
$ aca client [dirname]

3. Generate database and api：
$ aca up
Using this command to update the database schema and api when orm changes in the future
`

export const serverCreatedEcho = () => `
Run：aca up，or：aca rollback
`

export function clientApiIndex(dbs: string[], RPCs: string[]) {
  const apiStr = (arr: string[]) =>
    arr
      .map(
        (v) => `$.${v} = new $Request(url, requestInit)
$.${v}.reqIntercept = (args: $ApiBridge) => {
  // $.${v}.requestInit = requestInit
}
$.${v}.resIntercept = (rtn: any) => {
  // Process the return value：rtn as needed
}
`
      )
      .join('\n\n')

  return `// This file is a template file. Introduce this file in other pages to use it.
// This file is only generated once. It will be regenerated only when the file is deleted
import { $, $Request, $ApiBridge } from './aca'

// Fill in the address of the the backend server. Note: be sure to change it to the address of the production environment when deploying to the production environment
/*******************************Fill out the following as needed************************ */
const url = ''

const headers = {
  'Content-Type': 'application/json',
}

const requestInit: RequestInit = {
  method: 'post',
  mode: 'cors',
  headers: headers,
}

${apiStr(dbs)}
${apiStr(RPCs.map((v) => `$RPC.${v}`))}
export type { $EnumType, $TableType, $TB } from './aca'
export { $RPC, ${dbs.join(', ')} } from './aca'
`
}

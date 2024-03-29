/// <reference types="../../types" />
import path from 'path'
import * as Cst from '../constant'
import SqlDiff from '../sql-diff'
export * from './index-koa'
export * from './api-placeholder'
export * from './react-page'

export const classHeadClient = (dbVar: string) => `\n
export const ${dbVar} =new (class {
`

export const transaction = (queries: string) => `
async transaction() {
  const trx:any = await this.knex.transaction()
  trx['$Driver'] = this.$Driver

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
export const transactionClient = (queries: string) => `async transaction() {

  return {
    async commit() {},
    async rollback() {},
    isCompleted() {},
    ${queries}
}
}
`

export const pkgServer = (name: string, drivers: string[]) => {
  return `
{
  "name": "${name}",
  "description": "",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "ts-node src/index"
  },
  "dependencies": {
    "koa": "",
    "koa-body": "",
    "koa-cors": "",
    ${drivers.map((v) => `${SqlDiff(<any>v).keyword.npm}`).join('\n')}
    "cuid": "",
    "uuid": "",
    "knex": ""
  },
  "devDependencies": {
    "@types/node": ""
  }
}
`
}

// Table query interface template
export const tableQuery = (query, tblName) => `{
  const trx:any = await this.knex.transaction()
  trx['$Driver'] = this.$Driver
  try {
    const rtn = await $Handle( trx )({ query: '${query}', table: '${tblName}', args })
    await trx.commit()
    return rtn
  } catch (err:any) {
    await trx.rollback()
    return { error: err.toString() }
  }
} `

//  frontend footer
export const classFooterClient = (dbVar: string) => `\n$ = {
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
    const trx:any = await this.knex.transaction()
    trx['$Driver'] = this.$Driver
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
    } catch (e:any) {
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
  private $Driver = '${sqlDiff.keyword.fullName}'
  private knex: Knex
  constructor() {
    let connection = process.env['${
      config.connectOption.envConnect || ''
    }'] || ${JSON.stringify(config.connectOption.connect, null, 2)}

  try {
    if (typeof connection == 'string') connection = JSON.parse(connection)
  } catch (e) { }

  this.knex = knex({
    client: this.$Driver,
    ${sqlDiff.keyword.stmt.additionalConnectOpts}
    connection: ${sqlDiff.keyword.stmt.connectionOpts}
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
        .reduce((_:any, v: any) => _[v], { ${dbs.toString()} }[reqBody.dbVar])
        [reqBody.query](reqBody.args)
    case 'raw':
      return await { ${dbs.toString()} }[reqBody.dbVar]?.$.raw(reqBody.args)
  }
}
`
// Summary of orm changes
export const remark = (date, comment) => ({
  date: new Date(date).toLocaleString(),
  id: date,
  comment,
})

export const createdEcho = (name: string) => `
$ cd ${name}
1. Open .aca/config.json file for configuration:
${path.resolve(name, Cst.AcaConfig)}
  
2. Create a server-side app (at least one) and a client-side app in the current directory: 
Create a server-side koa app using command: 
$ aca server [dirname]

Create a client-side using command, internally call create-react-app to create a react app: 
$ aca client [dirname]

Add self built app(the app dictionary in the aca project dictionary): 
$ aca add [dirname]

3. Async database schema. Generate api:
$ aca up
Using this command to update the database schema and api when orm changes in the future
`

export const createdEchoServer = () => `
Run: aca up
`

export function apiIndexClient(dbs: string[], RPCs: string[], fetcher: string) {
  const apiStr = (arr: string[]) =>
    arr
      .map(
        (v) => {
          switch (fetcher) {
            case 'wx.request': 
            case 'my.request': 
            case 'tt.request': {
              return `
              $.${v} = new $Request(url)
              $.${v}.setHttpClient({
                fetcher: async (req) => {
                  return new Promise((resolve, reject) => {
                    ${fetcher}({
                      method: "POST",
                      url: req.url,
                      data: req.body,
                      header: req.headers,
                      success (response) {
                        resolve(response.data)
                      },
                      fail (err) {
                        reject(err)
                      }
                    });
                  })
                },
                interceptors:{
                  request: (req) => {
                    // 请根据需求编写请求拦截代码
                    console.log(req)
                    return req
                  },
                  response: (res) => {
                    // 请根据需求编写响应拦截代码
                    console.log(res)
                    return res
                  }
                }
              })
              `
            }
            case 'uni.request':
            case 'Taro.request': {
              return `
              $.${v} = new $Request(url)
              $.${v}.setHttpClient({
                fetcher: async (req) => {
                  const response = await ${fetcher}({
                    method: "POST",
                    url: req.url,
                    data: req.body,
                    header: req.headers,
                  });
                  return response.data
                },
                interceptors:{
                  request: (req) => {
                    // 请根据需求编写请求拦截代码
                    console.log(req)
                    return req
                  },
                  response: (res) => {
                    // 请根据需求编写响应拦截代码
                    console.log(res)
                    return res
                  }
                }
              })
              `
            }
            case 'fetch':
            default: {
              return `
              $.${v} = new $Request(url)
              $.${v}.setHttpClient({
                interceptors:{
                  request: (req) => {
                    // 请根据需求编写请求拦截代码
                    console.log(req)
                    return req
                  },
                  response: (res) => {
                    // 请根据需求编写响应拦截代码
                    console.log(res)
                    return res
                  }
                }
              })
              ` 
            }
          }
        }
      )
      .join('\n\n')

  return `// This file can be modified as needed, and can be used by importing this file in other pages
// This file is generated only once. Deleting this file will regenerate it
import { $, $Request } from './aca'
${fetcher === 'Taro.request' ? "import Taro from '@tarojs/taro'" : ''}
/***************************************************************** */
// Fill in the address of the back-end server.
// Note: when deploying to the production environment, it must be changed to the address of the production environment
const url = 'http://localhost:8080'

${apiStr(dbs)}
${apiStr(RPCs.map((v) => `$RPC.${v}`))}
export type { $Enum } from './aca'
export { $RPC, ${dbs.join(', ')} } from './aca'
`
}

export const reqInstTpl = (fnStr: string, dbStr: string) => `export const $ = {
  $RPC: {
      ${fnStr}
    },
      ${dbStr}
  }
  `

export const fnTpl = (fnApis: string) =>
  fnApis.trim()
    ? `export namespace $RPC {
    ${fnApis}
  }`
    : `export const $RPC = 'No remote functions are currently generated'`

export const reqInitValueTpl = `{
  req(args: any) {
    return <any>{}
  },
  setHttpClient({
    fetcher,
    interceptors,
  }: IHttpClient) {},
}`



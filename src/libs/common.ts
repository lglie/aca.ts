import fs from 'fs'
import path from 'path'
import * as Cst from './constant'
import { apiPlaceholder } from './templates'

BigInt.prototype['toJSON'] = function () {
  return this.toString()
}

export const ScalarTypes = [
  'id',
  'boolean',
  'int',
  'bigint',
  'float',
  'string',
  'object',
  'Date',
  'enum',
]

// Create folders recursively
export function MkdirsSync(dirname: string) {
  if (fs.existsSync(dirname)) return true
  else if (MkdirsSync(path.dirname(dirname))) return fs.mkdirSync(dirname), true
}

// Empty object or array
export const isEmpty = (obj: any) =>
  obj
    ? Array.isArray(obj)
      ? obj.length
        ? false
        : true
      : obj.toString() === '[object Object]'
      ? Object.keys(obj).length
        ? false
        : true
      : true
    : true
// Non-empty object or array
export const notEmpty = (obj: any) =>
  obj
    ? Array.isArray(obj)
      ? obj.length
        ? true
        : false
      : obj.toString() === '[object Object]'
      ? Object.keys(obj).length
        ? true
        : false
      : false
    : false

// Format datetime
export const DtFormat = (dt: Date) => {
  const year = dt.getFullYear().toString(),
    month = (dt.getMonth() + 1).toString(),
    date = dt.getDate().toString(),
    hour = dt.getHours().toString(),
    minute = dt.getMinutes().toString(),
    second = dt.getSeconds().toString(),
    Milli = dt.getMilliseconds().toString()
  const format = (name: string) => (name.length > 1 ? '' : '0') + name
  return (
    year +
    format(month) +
    format(date) +
    format(hour) +
    format(minute) +
    format(second) +
    Milli
  )
}

export const getName = (obj: any): string => obj.name

// Add quotation marks to elements in a string or string array
export const AddQuote = <T extends string | string[]>(el: T, quote = '"'): T =>
  Array.isArray(el) ? <any>el.map((v) => quote + v + quote) : quote + el + quote

// Merge files in a folder into an object
export const PlainFiles = (p: string): string | { [k: string]: string } => {
  if (!fs.statSync(p)) throw `Cannot find orm file or folder: ${p}`
  if (fs.statSync(p).isFile())
    return { [p]: fs.readFileSync(path.resolve(p), 'utf-8') }

  const rtn = <{ [k: string]: string }>{}

  const Iter = (d: string, ns: string[] = []) => {
    fs.readdirSync(p).forEach((v) => {
      const pt = [...ns, v].join('/')
      const stat = fs.statSync(pt)
      if (stat.isDirectory()) {
        Iter(pt, [...ns, v])
      } else if (stat.isFile()) {
        rtn[pt] = fs.readFileSync(path.resolve(pt), 'utf-8')
      }
    })
  }

  Iter(p)

  return rtn
}

// Match the string in the parentheses of the file content（() [] {}）and return a tuple
export function MatchBracket(content: string, bracket: '(' | '[' | '{') {
  const leftReg = RegExp('\\' + bracket, 'g'),
    rightReg = RegExp('\\' + { '(': ')', '[': ']', '{': '}' }[bracket], 'g')
  const left = content.match(RegExp(`\\${bracket}`))
  if (!left) throw 'No parentheses need to be matched in the text'
  const rtn = [left.index!]
  rightReg.lastIndex = rtn[0] + 1

  let step
  while ((step = rightReg.exec(content))) {
    const ctt = content.slice(rtn[0], rightReg.lastIndex)
    const right = rightReg.lastIndex - 1
    if (ctt.match(leftReg)?.length === ctt.match(rightReg)?.length) {
      rtn[1] = right
      break
    } else rightReg.lastIndex = right + 1
  }

  if (!rtn[1]) throw 'No parentheses need to be matched in the text'
  return rtn
}

// Parse model table or map of fields
export function MapRename(props: { map?: string }) {
  const rtn = { map: '' }
  ;['map'].forEach((v) => {
    if (props[v]) {
      rtn[v] = props[v]
      delete props[v]
    }
  })
  return rtn
}

export function MapTblName(
  table: string,
  column: string,
  table2: string,
  column2: string
) {
  const sorted = [
    `${table}${column[0].toUpperCase()}${column.slice(1)}`,
    `${table2}${column2[0].toUpperCase()}${column2.slice(1)}`,
  ].sort()
  return `_${sorted[0]}_${sorted[1]}`
}

// Find the given model name in ast and return the object and its absolute namespace(absolute path)
export function FindModel(obj: object, currNs: string[], name: string) {
  // Find the enum definitions sequentially from the current namespace until matching
  for (let i = currNs.length; i >= 0; i--) {
    const namespace = currNs.slice(0, i)
    const sub = [...namespace].reduce((_, v) => {
      _ = _[v].models
      return _
    }, obj)
    if (sub[name]) return { namespace, model: sub[name] }
  }
}

export function FlatTables(tbls: Tables) {
  const rtn = {}

  const Iter = (subTbls: Tables) => {
    for (const k in subTbls) {
      if ('string' === typeof subTbls[k].kind)
        rtn[(<TableView>subTbls[k]).jsName] = subTbls[k]
      else Iter(<Tables>subTbls[k])
    }
  }

  Iter(tbls)

  return <FlatTables>rtn
}

export const Deprecated = (comment?: string) =>
  `/**@deprecated ${comment || ''} */\n`

// Copy directory
export function CopyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest)
  }
  if (!fs.existsSync(src)) {
    return false
  }
  const dirs = fs.readdirSync(src)
  dirs.forEach(function (item) {
    const item_path = path.join(src, item)
    const temp = fs.statSync(item_path)
    if (temp.isFile()) {
      fs.copyFileSync(item_path, path.join(dest, item))
    } else if (temp.isDirectory()) {
      CopyDirectory(item_path, path.join(dest, item))
    }
  })
}
// Add this app to: .aca/config.json#serverApps
export function addAppConfig(
  acaDir: '.' | '..',
  appName: string,
  kind: 'server' | 'client',
  expApi: string[],
  apiDir: string,
  fetcher?: 'wx.request' | 'my.request' | 'tt.request' | 'uni.request' | 'Taro.request'
) {
  const acaRoot = path.resolve(acaDir)
  const config: Config = require(path.join(acaRoot, Cst.AcaConfig))
  const templatePath = path.join(__dirname, '../../templates')
  const resolveApiDir = path.join(acaRoot, appName, apiDir)

  const serverFiles = {
    [Cst.ServerRPCIndex]: 'rpc-index',
    [Cst.ServerRPCExample]: 'rpc-example'
  }

  switch (kind) {
    case 'server':
      // Create all levels of directories recursively
      MkdirsSync(path.join(resolveApiDir, Cst.ServerRPCDir))
      // Generate api related files
      fs.writeFileSync(
        path.join(resolveApiDir, Cst.ApiIndex),
        apiPlaceholder(expApi),
        'utf-8'
      )
      for (const k in serverFiles) {
        fs.copyFileSync(
          path.join(templatePath, serverFiles[k]),
          path.join(resolveApiDir, k)
        )
      }

      config.serverApps[appName] = {
        apiDir,
      }
      break
    case 'client':
      // Create all levels of directories recursively
      MkdirsSync(resolveApiDir)

      config.clientApps[appName] = {
        "~": "可以通过配置fetcher字段来生成不同的http客户端请求。支持的配置参数有 'wx.request' | 'my.request' | 'tt.request' | 'uni.request' | 'Taro.request'。也可以通过如下命令自动配置 aca add -c -f wx.request ",
        apiDir,
        allowRPCs: Object.keys(config.serverApps),
      }
      fetcher && (config.clientApps[appName]['fetcher'] = fetcher)
  }
  delete config.orm
  fs.writeFileSync(
    path.join(acaRoot, Cst.AcaConfig),
    JSON.stringify(config, null, 2),
    'utf-8'
  )

  console.log(`\nRun the following command to start development:`)
  console.log(`$ cd ${acaDir === '..' ? '../' : ''}${appName}`)
  console.log(`$ npm start`)
}
// If the current working directory is the project directory, return ".", If it is the app directory, return the app directory name, otherwise return undefined
export function currentDir() {
  if (fs.existsSync(Cst.AcaDir)) return '.'
  else if (fs.existsSync(path.join('..', Cst.AcaDir))) {
    return path.basename(path.resolve('.'))
  }
}
// Check the apps in the config and remove apps that are deleted
export function checkApps(acaDir: AcaDir, config: Config) {
  let changed = false

  Object.keys(config.serverApps).forEach((v) => {
    if (!fs.existsSync(path.join(acaDir, v))) {
      delete config.serverApps[v]
      changed = true
    }
  })

  Object.keys(config.clientApps).forEach((v) => {
    if (!fs.existsSync(path.join(acaDir, v))) {
      delete config.clientApps[v]
      changed = true
    }
  })

  if (changed) {
    fs.writeFileSync(
      path.join(acaDir, Cst.AcaConfig),
      JSON.stringify(config, null, 2)
    )
  }
}

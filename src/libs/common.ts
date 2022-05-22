import fs from 'fs'
import path from 'path'
import * as Cst from './constant'
import { apiPlaceholder } from '../libs/template'

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

// 递归创建文件夹
export function MkdirsSync(dirname: string) {
  if (fs.existsSync(dirname)) return true
  else if (MkdirsSync(path.dirname(dirname))) return fs.mkdirSync(dirname), true
}

// 空对象或数组
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
// 非空对象或数组
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

// 格式化日期时间
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

// 对字符串或字符串数组内的元素添加引号
export const AddQuote = <T extends string | string[]>(el: T, quote = '"'): T =>
  Array.isArray(el) ? <any>el.map((v) => quote + v + quote) : quote + el + quote

// 将文件夹里的文件合并成对象
export const PlainFiles = (p: string): string | { [k: string]: string } => {
  if (!fs.statSync(p)) throw `没有找到orm文件或文件夹：${p}`
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

// 匹配文件内容括号里的字符串（() [] {}）,返回含起始位置和终止位置的元组
export function MatchBracket(content: string, bracket: '(' | '[' | '{') {
  const leftReg = RegExp('\\' + bracket, 'g'),
    rightReg = RegExp('\\' + { '(': ')', '[': ']', '{': '}' }[bracket], 'g')
  const left = content.match(RegExp(`\\${bracket}`))
  if (!left) throw '文本不存在需要匹配的括弧'
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

  if (!rtn[1]) throw '文本不存在需要匹配的括弧'
  return rtn
}

// 解析model的表或字段的map
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
  const sorted = [`${table}_${column}`, `${table2}_${column2}`].sort()
  return `_${sorted[0]}_$_${sorted[1]}`
}

// 在ast中查找给定的model名，并返回该对象及所在的绝对命名空间（绝对路径）
export function FindModel(obj: object, currNs: string[], name: string) {
  // 依次从当前命名空间查找枚举定义，直到匹配到为止
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

// 复制目录
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
// 将该应用程序添加到: .aca/config.json#serverApps
export function addAppConfig(
  acaDir: '.' | '..',
  name: string,
  kind: 'server' | 'client',
  expApi: string[],
  apiDir
) {
  const resolveAcaDir = path.resolve(acaDir)
  const config: Config = require(path.join(resolveAcaDir, Cst.AcaConfig))
  const templatePath = path.join(__dirname, '../../templates')
  const resolveApiDir = path.join(resolveAcaDir, name, apiDir)

  const serverFiles = {
    [Cst.ServerRPCIndex]: 'rpc-index',
  }

  switch (kind) {
    case 'server':
      // 递归创建各级目录
      MkdirsSync(path.join(resolveApiDir, Cst.ServerRPCDir))
      // 生成api相关文件
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

      config.serverApps[name] = {
        apiDir,
      }
      break
    case 'client':
      // 递归创建各级目录
      MkdirsSync(resolveApiDir)

      config.clientApps[name] = {
        apiDir,
        allowRPCs: Object.keys(config.serverApps),
      }
  }

  fs.writeFileSync(
    path.join(resolveAcaDir, Cst.AcaConfig),
    JSON.stringify(config, null, 2),
    'utf-8'
  )
}
// 如果当前工作目录是project目录返回".aca"，如果是应用程序目录，返回应用程序目录名称，否则返回undefined
export function currentDir() {
  const higher = path.join('..', Cst.AcaDir)
  if (fs.existsSync(Cst.AcaDir)) return Cst.AcaDir
  else if (fs.existsSync(higher)) {
    return path.resolve('.').split(/\\|\//).reverse()[0]
  }
}
// 检查config里的应用，如果有被删除的则剔除
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

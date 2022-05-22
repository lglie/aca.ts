import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { createdEcho } from '../libs/template'
import { MkdirsSync } from '../libs/common'

export async function create(yargs: any) {
  const files = {
    [Cst.AcaConfig]: 'config.json',
    [Cst.AcaExample]: 'example-blog',
    [Cst.AcaOrmPropetty]: '.orm',
    [Cst.AcaTsconfig]: 'tsconfig.aca',
    [Cst.AcaMiscRemark]: 'remark',
  }

  const name = yargs.argv._[1]
  if (name) {
    if (fs.existsSync(name)) throw `当前目录下存在：${name}`
  } else {
    throw `缺少参数：aca create XXX, XXX为项目目录的名字`
  }

  // 递归创建目录
  MkdirsSync(path.join(name, Cst.AcaMiscRecordsDir))
  const tplDir = path.join(__dirname, '../../templates')

  for (const k in files) {
    const file = path.join(tplDir, files[k])
    fs.copyFileSync(file, path.join(name, k))
  }

  console.log(createdEcho(name))
}

import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { createdEcho } from '../libs/templates'
import { MkdirsSync } from '../libs/common'

export async function create(yargs: any) {
  const files = {
    [Cst.AcaConfigSchema]: 'config.schema.json',
    [Cst.AcaConfig]: 'config.json',
    [Cst.AcaExample]: 'example-blog',
    [Cst.AcaOrmPropetty]: '.orm',
    [Cst.AcaTsconfig]: 'tsconfig.aca',
    [Cst.AcaMiscRemark]: 'remark',
  }

  const name = yargs.argv._[1]
  if (name) {
    if (fs.existsSync(name)) throw `${name} exists in current directory`
  } else {
    throw `Missing parameters: aca create XXX, XXX is the project directory name`
  }

  // Recursively create directory
  MkdirsSync(path.join(name, Cst.AcaMiscRecordsDir))
  const tplDir = path.join(__dirname, '../../templates')

  for (const k in files) {
    const file = path.join(tplDir, files[k])
    fs.copyFileSync(file, path.join(name, k))
  }

  console.log(createdEcho(name))
}

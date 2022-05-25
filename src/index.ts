#!/usr/bin/env node
import * as command from './cli'

declare var echo: any // 系统命令
// declare var ts-node: any // 系统命令

require('shelljs/global')
const yargs = require('yargs')

const comment = {
  create: 'Init a new aca project [dirname]',
  server: 'Create a server [dirname] application, [dirname] default: server.',
  client: 'Create a client [dirname] application, [dirname] default: client.',
  add: 'Add a app config. -s(--server) or -c(--client): server app or client app, -a [name]: apiDir name, default src/aca.server or src/aca.client',
  up: 'Alter database schema and generate api',
  rollback: 'Rollback to previous release',
}
const usage = `
aca create [dirname]  ${comment.create}
aca server [dirname]  ${comment.server}
aca client [dirname]  ${comment.client}
aca add [dirname] <-s or -c> -a [name]  ${comment.add}
aca up  ${comment.up}
aca rollback  ${comment.rollback}
`

if (yargs.argv._.length) {
  yargs
    .command('create', comment.create, command.create)
    .command('server', comment.server, command.server)
    .command('client', comment.client, command.client)
    .command('add', comment.add, command.addApp)
    .command('up', comment.up, command.up)
    .command('rollback', comment.rollback, command.up)
    .usage(usage)
    .help('h')
    .alias('h', 'help').argv
} else echo(usage)

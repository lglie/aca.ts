#!/usr/bin/env node
import * as command from './cli'

declare var echo: any // system command
// declare var ts-node: any // system command

require('shelljs/global')
const yargs = require('yargs')

const comment = {
  create: 'create a new aca project <projectName>',
  server: 'create a server app, [appName] default: server',
  client: 'create a client app, [appName] default: client',
  add: 'add yourself app to the project, -s(--server) -c(--client), -a(--apiDir) [path]: default src/aca.server src/aca.client',
  up: 'create or alter database schema, and generate api',
  rollback: 'rollback to previous release',
}
const usage = `
aca create <projectName>           ${comment.create}
aca server [appName]               ${comment.server}
aca client [appName]               ${comment.client}
aca add [appName] -s -c -a [path]  ${comment.add}
aca up                             ${comment.up}
aca rollback                       ${comment.rollback}
aca --version                      show current version
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

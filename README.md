English | [中文文档](https://aca.ts.center/zh)

# Aca.ts

> Aca.ts is a CLI that automatically generates typescript API. It can automatically synchronize database schema according to a custom ORM file(database definition described by typescript class); Automatically generate frontend and backend APIs for accessing the database; Automatically generate frontend APIs with the same name to access Web backend functions (like RPC, do not specify routes). The backend code can be written on the frontend, which is an ideal solution for fullstack development.

Use the class syntax of Typescript to define ORM:

- Define a root namespace to represent your database
- Define a table with a class (class name as table name)
- Define a column or a relationship with a class property (property name as column name)
- Add constraints to a table or a column with decorators

# An example could be found below:

example-blog.ts

```typescript
namespace db {
  export class user {
    id: id
    @$_.unique name: string
    age?: int
    married = false
    profile?: profile
    posts: post[]
  }

  export class profile {
    id: id
    password: string
    @$_.foreign('userId') user: user
  }

  export class post {
    id: id
    content: string
    score: float
    @$_.foreign('userId') user: user
    categories: category[]
  }

  export class category {
    id: id
    name: string
    @$_.foreign('categoryId') parent?: category
    children: category[]
    posts: post[]
  }
}
```

# Install

```bash
npm install -g aca.ts
```

# Usage

1. Create an aca project:

```bash
$ aca create <projectName>
$ cd <projectName>
```

2. Open .aca directory, copy your custom ORM file into the directory, and add this file name to config.json/orm field.

<img with="80px" hight="180px" src="https://aca.ts.center/config.jpg">

3. Use the following method to create aca.ts apps:

Create a backend app (a simple koa framework):

```bash
$ aca server
```

Create a frontend app (a react app with create-react-app):

```bash
$ aca client
```

Add self built app to the project:

```bash
$ aca add <appName> --server --client --apiDir <path>
  path default: src/aca.server  src/aca.client
```

4. Generate api

```bash
$ aca up
```

Then the database, frontend (if necessary), and backend are all set up, you can start your project now. Happy coding!

#

> <font color=red>The generated backend APIs usage example are as follows:</font> <img with="80px" hight="180px" src="https://aca.ts.center/server-koa-index.jpg">

#

> <font color=red>The generated frontend APIs usage example are as follows:</font> <img with="80px" hight="180px" src="https://aca.ts.center/client-react-app.jpg">

#

# Supported databases for now:

- PostgreSQL
- MSSQL
- Better-Sqlite3

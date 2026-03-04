import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/express'

const prisma = new PrismaClient()
const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET || 'dev-secret-change-me-in-production!!' },
})

app.use('/auth', auth.router())

app.get('/api/me', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`)
})

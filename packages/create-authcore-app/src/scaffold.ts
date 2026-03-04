import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface ScaffoldOptions {
  name: string
  template: string
  packageManager: string
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { name, template } = options
  const targetDir = path.resolve(process.cwd(), name)
  const templateDir = path.resolve(__dirname, '..', 'templates', template)

  // Check target doesn't exist
  const exists = await fs.access(targetDir).then(() => true).catch(() => false)
  if (exists) {
    throw new Error(`Directory "${name}" already exists`)
  }

  // Recursively copy template to target
  await copyDir(templateDir, targetDir)

  // Rename _gitignore to .gitignore
  const gitignorePath = path.join(targetDir, '_gitignore')
  const gitignoreExists = await fs.access(gitignorePath).then(() => true).catch(() => false)
  if (gitignoreExists) {
    await fs.rename(gitignorePath, path.join(targetDir, '.gitignore'))
  }

  // Also rename nested _gitignore files (api-only and monorepo have subdirs)
  await renameGitignoreRecursive(targetDir)

  // Update project name in root package.json
  await updatePackageName(targetDir, name)
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function renameGitignoreRecursive(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name)
      const gitignorePath = path.join(subDir, '_gitignore')
      const exists = await fs.access(gitignorePath).then(() => true).catch(() => false)
      if (exists) {
        await fs.rename(gitignorePath, path.join(subDir, '.gitignore'))
      }
      await renameGitignoreRecursive(subDir)
    }
  }
}

async function updatePackageName(dir: string, name: string): Promise<void> {
  const pkgPath = path.join(dir, 'package.json')
  const exists = await fs.access(pkgPath).then(() => true).catch(() => false)
  if (exists) {
    const raw = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw)
    pkg.name = name
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }
}

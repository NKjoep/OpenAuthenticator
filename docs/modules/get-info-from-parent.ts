import * as fs from 'fs'
// @ts-expect-error `dot-object` is not a TS library.
import * as dot from 'dot-object'
import { createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import * as yaml from 'yaml'

/**
 * Represents a language.
 */
interface Language {
  code: string
  name: string
}

export interface LanguageWithData extends Language {
  progress: number
  files: string[]
}

/**
 * Options for this module.
 *
 * @interface
 */
export interface ModuleOptions {
  pubspecPath: string
  libI18nPath: string
  docsI18nPath: string
  destinationDirectory: string
  primaryLanguage: string
  languages: Language[]
}

/**
 * The module name.
 */
const name = 'get-info-from-parent'

/**
 * The logger instance.
 */
const logger = useLogger(name)

/**
 * Nuxt module for downloading the website content.
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name,
    version: '0.0.1',
    compatibility: { nuxt: '^3.0.0' },
    configKey: 'getInfoFromParent',
  },
  defaults: {
    pubspecPath: '../pubspec.yaml',
    libI18nPath: '../lib/i18n/',
    docsI18nPath: './i18n/locales/',
    destinationDirectory: '_app',
    primaryLanguage: 'en',
    languages: [
      {
        code: 'en',
        name: 'English',
      },
      {
        code: 'fr',
        name: 'Français',
      },
      {
        code: 'es',
        name: 'Español',
      },
      {
        code: 'pt',
        name: 'Portuguese',
      },
    ],
  },
  setup: async (options, nuxt) => {
    const resolver = createResolver(import.meta.url)
    const srcDir = nuxt.options.srcDir
    const moduleDir = resolver.resolve(srcDir, 'node_modules', `.${name}`)
    const destinationDir = resolver.resolve(moduleDir, options.destinationDirectory)
    fs.mkdirSync(destinationDir, { recursive: true })
    logger.info('Extracting application version...')
    const pubspec = yaml.parse(fs.readFileSync(resolver.resolve(srcDir, options.pubspecPath), 'utf8'))
    let version = pubspec['version']
    if (version.includes('+')) {
      version = version.substring(0, version.indexOf('+'))
    }
    fs.writeFileSync(resolver.resolve(destinationDir, 'version.json'), JSON.stringify({ version: version }), 'utf8')
    logger.success(`Success : ${version} !`)
    logger.info('Extracting application languages...')
    const languagesFile = resolver.resolve(destinationDir, `languages.json`)
    const languages: Record<string, Language> = {}
    for (const language of options.languages) {
      languages[language.code] = language
    }
    fs.writeFileSync(languagesFile, JSON.stringify({}), 'utf8')
    const libI18nDir = resolver.resolve(srcDir, options.libI18nPath)
    const primaryLanguageDir = resolver.resolve(libI18nDir, options.primaryLanguage)
    const primaryLanguageFiles: Record<string, object> = {}
    let totalKeys = 0
    for (const subFileName of fs.readdirSync(primaryLanguageDir)) {
      const subFile = resolver.resolve(primaryLanguageDir, subFileName)
      const data = dot.dot(JSON.parse(fs.readFileSync(subFile, 'utf8')))
      primaryLanguageFiles[subFileName] = data
      totalKeys += Object.keys(data).length
    }
    const languagesFileContent: Record<string, LanguageWithData> = {}
    for (const subFileName of fs.readdirSync(libI18nDir)) {
      const subFile = resolver.resolve(libI18nDir, subFileName)
      if (!fs.lstatSync(subFile).isDirectory()) {
        continue
      }
      const languageDir = resolver.resolve(destinationDir, subFileName)
      fs.cpSync(subFile, languageDir, { recursive: true })
      let translatedKeys = 0
      const files = fs.readdirSync(languageDir)
      for (const file of files) {
        const subFile = resolver.resolve(languageDir, file)
        const primaryLanguageFile = primaryLanguageFiles[file]
        const translatedData = dot.dot(JSON.parse(fs.readFileSync(subFile, 'utf8')))
        if (primaryLanguageFile) {
          for (const key in primaryLanguageFile) {
            if (key in translatedData) {
              translatedKeys++
            }
          }
        }
      }
      languagesFileContent[subFileName] = {
        ...languages[subFileName],
        progress: translatedKeys / totalKeys,
        files: files,
      }
      logger.info(`Found ${subFileName}.`)
    }
    for (const language of options.languages) {
      if (!(language.code in languagesFileContent)) {
        languagesFileContent[language.code] = {
          ...language,
          progress: 0,
          files: [],
        }
        logger.info(`${language.code} not found.`)
      }
    }
    fs.writeFileSync(languagesFile, JSON.stringify(languagesFileContent), 'utf8')
    logger.success(`Done.`)
    // logger.info('Extracting docs languages...')
    // const languages = await import(resolver.resolve(srcDir, options.docsI18nPath))
    // for (const language in languages) {
    //   fs.writeFileSync(resolver.resolve(destinationDir, language, 'docs.json'), JSON.stringify(languages[language]), 'utf8')
    //   logger.info(`Found ${language}.`)
    // }
    // logger.success(`Done.`)
    logger.info('Registering module directory...')
    nuxt.options.nitro.publicAssets = nuxt.options.nitro.publicAssets || []
    nuxt.options.nitro.publicAssets.push({
      baseURL: `/${options.destinationDirectory}/`,
      dir: destinationDir,
      fallthrough: true,
    })
    logger.success(`Done.`)
  },
})

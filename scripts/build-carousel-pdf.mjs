import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const carouselDir = path.join(projectRoot, 'docs', 'assets', 'carousel')
const linksPath = path.join(carouselDir, 'links.json')
const outputPath = path.join(carouselDir, 'lexorank-carousel.pdf')

const PAGE_WIDTH = 1080
const PAGE_HEIGHT = 1350

const requiredLinks = ['article', 'sourceCode', 'demo', 'previousArticle']
const links = JSON.parse(await fs.readFile(linksPath, 'utf8'))

for (const name of requiredLinks) {
  const value = links[name]
  if (typeof value !== 'string' || !/^https:\/\//u.test(value)) {
    throw new Error(`links.json must contain a secure HTTPS URL for "${name}".`)
  }
}

const pdf = await PDFDocument.create()
pdf.setTitle('LexoRank Beyond the Midpoint')
pdf.setAuthor('Alexey Kuznetsov')
pdf.setSubject('Buckets, local repair, and online rebalancing')
pdf.setKeywords(['LexoRank', 'drag and drop', 'ranking', 'rebalancing', 'Vue'])
pdf.setCreator('custom-drag-and-drop-in-virtualized-tree')
pdf.setProducer('pdf-lib')

for (let slide = 1; slide <= 9; slide += 1) {
  const fileName = `slide-${String(slide).padStart(2, '0')}.png`
  const pngBytes = await fs.readFile(path.join(carouselDir, fileName))
  const image = await pdf.embedPng(pngBytes)
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  })

  if (slide === 9) {
    addPageNineLinks(pdf, page, links)
  }
}

const bytes = await pdf.save({ useObjectStreams: false })
await verifyPdf(bytes, links)
await fs.writeFile(outputPath, bytes)

const sizeMiB = (bytes.length / 1024 / 1024).toFixed(2)
console.log(`Created ${path.relative(projectRoot, outputPath)} (${sizeMiB} MiB)`)
console.log('Page 9 links: article, demo, source code, and previous article.')
console.log('The previous preview URL remains in links.json for the LinkedIn post caption.')

function addPageNineLinks(document, page, urls) {
  const annotations = [
    createLink(document, {
      label: 'Open the full LexoRank article',
      url: urls.article,
      x: 78,
      top: 540,
      width: 450,
      height: 330,
    }),
    createLink(document, {
      label: 'Open the live LexoRank demo',
      url: urls.demo,
      x: 552,
      top: 540,
      width: 450,
      height: 330,
    }),
    createLink(document, {
      label: 'Open the source code on GitHub',
      url: urls.sourceCode,
      x: 78,
      top: 920,
      width: 924,
      height: 70,
    }),
    createLink(document, {
      label: 'Open the previous drag-and-drop article',
      url: urls.previousArticle,
      x: 78,
      top: 1004,
      width: 924,
      height: 82,
    }),
  ]

  page.node.set(PDFName.of('Annots'), document.context.obj(annotations))
}

function createLink(document, { label, url, x, top, width, height }) {
  const y = PAGE_HEIGHT - top - height

  return document.context.register(
    document.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      Contents: PDFString.of(label),
      H: 'I',
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(url),
      },
    }),
  )
}

async function verifyPdf(bytes, urls) {
  const document = await PDFDocument.load(bytes)
  const pages = document.getPages()

  if (pages.length !== 9) {
    throw new Error(`Expected 9 PDF pages, found ${pages.length}.`)
  }

  for (const [index, page] of pages.entries()) {
    if (page.getWidth() !== PAGE_WIDTH || page.getHeight() !== PAGE_HEIGHT) {
      throw new Error(`Slide ${index + 1} has an unexpected PDF page size.`)
    }
  }

  const annotations = pages[8].node.lookup(PDFName.of('Annots'))
  if (!annotations || annotations.size() !== 4) {
    throw new Error('Slide 9 must contain exactly four link annotations.')
  }

  const embeddedUrls = []
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = annotations.lookup(index)
    const action = annotation.lookup(PDFName.of('A'))
    const uri = action.lookup(PDFName.of('URI'))
    embeddedUrls.push(uri.decodeText())
  }

  const expectedUrls = [urls.article, urls.demo, urls.sourceCode, urls.previousArticle]
  if (embeddedUrls.sort().join('\n') !== expectedUrls.sort().join('\n')) {
    throw new Error('The serialized PDF does not contain the expected page-9 URLs.')
  }
}

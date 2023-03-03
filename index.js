const fetch = require('node-fetch')
const cheerio = require('cheerio')
const fs = require('fs')
const Promise = require('bluebird');
 
fetch.Promise = Promise;

const baseUrl = 'https://www.ly.gov.tw/'
const nowLegislatorSelectorAtHome = 'a[title="本屆立委"]'
const legislatorSelectorAtList = '.legislatorname'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const combineURLs = (baseUrl, relativeUrl) => relativeUrl
  ? baseUrl.replace(/\/+$/, '') + '/' + relativeUrl.replace(/^\/+/, '')
  : baseUrl

async function fetchTextAndParser (url) {
  const res = await fetch(url)
  if (!res.ok) {
    await sleep(Math.floor(5000 * Math.random()))
    return fetchTextAndParser(url)
  }
  const responseText = await res.text()
  const $ = cheerio.load(responseText)

  return { text: responseText, $ }
}

async function getLegislatorListUrl () {
  const { $ } = await fetchTextAndParser(combineURLs(baseUrl, '/Home/Index.aspx'))
  return combineURLs(baseUrl, $(nowLegislatorSelectorAtHome).attr('href'))
}

async function getLegislatorUrls (url) {
  const { $ } = await fetchTextAndParser(url)
  const contents = new Map()
  const result = $(legislatorSelectorAtList)
    .map((_, el) => {
      const cDom = $(el).parents('a').parents('.content').html()
      contents.set(cDom, (contents.get(cDom) ?? 0) + 1)
      return $(el).parents('a')
    })
    .toArray()
  const selectedContent = [...contents.entries()].find((c) => c[1] === Math.max(...contents.values()))[0]
  return result
    .filter((el) => $(el).parents('.content').html() === selectedContent)
    .map((el) => combineURLs(baseUrl, $(el).attr('href')))
}

async function fetchAndParseLegislator (url) {
  const { $ } = await fetchTextAndParser(url)
  const name = $('.legislatorname').text().trim()
  const image = combineURLs(baseUrl, $('img[src^="/Images/Legislators/"]').attr('src'))
  const info = $('.info-left').children().children('li')
    .toArray()
    .map((el) => {
      const texts = $(el).text().trim().split('：')
      if ($(el).children('ul').length) {
        return [
          texts[0],
          $(el).children('ul').children('li').toArray().map((l) => $(l).text())
        ]
      } else {
        return texts
      }
    })
    .reduce((sum, el) => ({ ...sum, [el[0]]: (el.length === 2 && Array.isArray(el[1])) ? el[1] : el.slice(1).join('：') }), {})

  let key = ''
  const histories = $('.info-right')
    .children()
    .map((i, element) => {
      if (element.tagName === 'h4') {
        key = $(element).text().trim()
      } else if (element.tagName === 'ul') {
        if ($(element).children().map((i, el) => $(el).text()).toArray().every((el) => el.includes('：'))) return { [key]: $(element).children().map((i, el) => $(el).text()).toArray().map((el) => el.split('：')).reduce((sum, el) => ({ ...sum, [el[0]]: el.slice(1).join('：') }), {}) }
        return { [key]: $(element).children().map((i, el) => $(el).text()).toArray() }
      }
      return null
    })
    .toArray()
    .filter((el) => el)
    .reduce((sum, el) => ({ ...sum, ...el }), {})

  console.log(`Finished ${name}...`)

  return {
    name,
    image,
    ...info,
    ...histories
  }
}

async function main () {
  console.time('Get legislator list URL')
  const listUrl = await getLegislatorListUrl()
  console.timeEnd('Get legislator list URL')

  console.time('Get legislator link list')
  const urls = await getLegislatorUrls(listUrl)
  console.timeEnd('Get legislator link list')
  console.log(`Discovery ${urls.length} legislators`)

  console.time('Get and parse legislators')
  const legislators = await Promise.map(urls, (el) => fetchAndParseLegislator(el), { concurrency: 3 })
  console.timeEnd('Get and parse legislators')
  fs.writeFileSync('./data/legislators.json', JSON.stringify(legislators, null, 2))
}

main().then(() => { process.exit() })

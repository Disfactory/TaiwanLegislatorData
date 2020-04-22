const fetch = require('node-fetch')
const cheerio = require('cheerio')
const fs = require('fs')
const Promise = require('bluebird');
 
fetch.Promise = Promise;

const baseUrl = 'https://www.ly.gov.tw/'
const nowLegislatorSelectorAtHome = 'a[title="本屆立委"]'
const legislatorSelectorAtList = '.legislatorname'

const combineURLs = (baseUrl, relativeUrl) => relativeUrl
  ? baseUrl.replace(/\/+$/, '') + '/' + relativeUrl.replace(/^\/+/, '')
  : baseUrl

async function fetchTextAndParser (url) {
  const responseText = await fetch(url).then((res) => res.text())
  const $ = cheerio.load(responseText)

  return { text: responseText, $ }
}

async function getLegislatorListUrl () {
  const { $ } = await fetchTextAndParser(combineURLs(baseUrl, '/Home/Index.aspx'))
  return combineURLs(baseUrl, $(nowLegislatorSelectorAtHome).attr('href'))
}

async function getLegislatorUrls (url) {
  const { $ } = await fetchTextAndParser(url)
  return $(legislatorSelectorAtList).map((_, el) => $(el).parents('a').attr('href')).toArray().map((el) => combineURLs(baseUrl, el))
}

async function fetchAndParseLegislator (url) {
  const { $ } = await fetchTextAndParser(url)
  const name = $('.legislatorname').text().trim()
  const image = combineURLs(baseUrl, $('img[src^="/Images/Legislators/"]').attr('src'))
  const info = $('.info-left').children().children('li').map((i, el) => $(el).text().trim()).toArray().map((el) => el.split('：')).reduce((sum, el) => ({ ...sum, [el[0]]: el[1] }), {})
  
  let key = ''
  const histories = $('.info-right')
    .children()
    .map((i, element) => {
      if (element.tagName === 'h4') {
        key = $(element).text().trim()
      } else if (element.tagName === 'ul') {
        if ($(element).text().includes('：')) return { [key]: $(element).children().map((i, el) => $(el).text()).toArray().map((el) => el.split('：')).reduce((sum, el) => ({ ...sum, [el[0]]: el[1] }), {}) }
        return { [key]: $(element).children().map((i, el) => $(el).text()).toArray() }
      }
      return null
    })
    .toArray()
    .filter((el) => el)
    .reduce((sum, el) => ({ ...sum, ...el }), {})

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
  const legislators = await Promise.map(urls, (el) => fetchAndParseLegislator(el), { concurrency: 8 })
  console.timeEnd('Get and parse legislators')
  fs.writeFileSync('./data/legislators.json', JSON.stringify(legislators, null, 2))
}

main().then(() => { process.exit() })

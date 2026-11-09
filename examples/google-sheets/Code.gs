/**
 * A custom function for Google Sheets: =UD_NAME("get.plumbing") answers the name's stored status, and
 * =UD_NAME("get.plumbing", "price.firstYear") any other field of the answer, by its dotted path.
 *
 * Answers are cached for six hours, so a sheet recalculating does not spend a call each time.
 *
 * @param {string} name The domain name.
 * @param {string} [field] The field to read. Defaults to status.
 * @return {string|number|boolean} The field's value, or an empty cell when the answer has none.
 * @customfunction
 */
function UD_NAME(name, field) {
  var path = field || 'status';
  var data = udReadName_(String(name).trim());
  var value = path.split('.').reduce(function (current, key) {
    return current === null || current === undefined ? current : current[key];
  }, data);
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : value;
}

function udReadName_(name) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ud:' + name.toLowerCase();
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var response = UrlFetchApp.fetch('https://api.unique.domains/v1/names/' + encodeURIComponent(name), {
    headers: { Accept: 'application/json' },
    muteHttpExceptions: true,
  });
  var body = JSON.parse(response.getContentText());
  // The API's own words: a formula shows them as its error.
  if (response.getResponseCode() !== 200) throw new Error(body.detail || 'The API answered ' + response.getResponseCode());

  cache.put(cacheKey, JSON.stringify(body.data), 21600);
  return body.data;
}

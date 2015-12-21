'use strict';

var crypto = require('crypto');
var fs = require('fs');
var gutil = require('gulp-util');
var mime = require('mime');
var through = require('through2');
var ALY = require('aliyun-sdk');
mime.default_type = 'text/plain';

function md5Hash(buf) {
  return crypto
    .createHash('md5')
    .update(buf)
    .digest('hex');
}

function getCacheFilename(options) {
  var bucket = options.headers['Bucket'];

  if (!bucket) {
    throw new Error('Missing `headers.Bucket` config value.');
  }

  return '.aliyunoss-' + bucket;
};

function saveCache(options, cache) {
  fs.writeFileSync(getCacheFilename(options), JSON.stringify(cache));
}

module.exports = function (aliyunConfig, options) {
  options = options || {};
  var cache;

  try {
    cache = JSON.parse(fs.readFileSync(getCacheFilename(options), 'utf8'));
  } catch (err) {
    cache = {};
  }

  if (!options.delay) {
    options.delay = 0;
  }

  var oss = new ALY.OSS({
    accessKeyId: aliyunConfig.key,
    secretAccessKey: aliyunConfig.secret,
    endpoint: aliyunConfig.endpoint,
    apiVersion: '2013-10-15'
  });

  var regexGzip = /\.([a-z]{2,})\.gz$/i;
  var regexGeneral = /\.([a-z]{2,})$/i;

  return through.obj(function(file, enc, cb) {
    // Verify this is a file
    if (!file.isBuffer()) {
      return cb(null, file);
    }

    var uploadPath = file.path.replace(file.base, options.uploadPath || '');
    uploadPath = uploadPath.replace(new RegExp('\\\\', 'g'), '/');

    var etag = md5Hash(file.contents);

    if (cache[uploadPath] === etag) {
      gutil.log(gutil.colors.blue('[SKIP]', file.path + " -> " + uploadPath));
      return cb(null, file);
    }

    var headers = {};
    if (options.headers) {
      for (var key in options.headers) {
        headers[key] = options.headers[key];
      }
    }

    var isGzipped = false;
    if (regexGzip.test(file.path)) {
      headers['ContentEncoding'] = 'gzip';
      isGzipped = true;
    }

    // Set content type based of file extension
    if (!headers['ContentType'] && regexGeneral.test(uploadPath)) {
      var contentType;
      if (isGzipped) {
        contentType = mime.lookup(uploadPath.substring(0, uploadPath.length - 3));
      } else {
        contentType = mime.lookup(uploadPath);
      }
      headers['ContentType'] = contentType;
    }

    //headers['Content-Length'] = file.stat.size;

    headers['Body'] = file.contents;

    headers['Key'] = uploadPath;

    gutil.log(gutil.colors.gray('[UPLOAD]', file.path));

    oss.putObject(headers,
      function (err, data) {

        if (err) {
          gutil.log(gutil.colors.red('[FAILED]', file.path + " -> " + uploadPath));
          gutil.log(err);
          return cb(err, file);
        }

        gutil.log(gutil.colors.green('[SUCCESS]', file.path + " -> " + uploadPath));

        // Save success to cache
        cache[uploadPath] = etag;

        saveCache(options, cache);

        return cb(null, file);
      });
  });
};

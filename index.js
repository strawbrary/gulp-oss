'use strict';

var es = require('event-stream');
var gutil = require('gulp-util');
var mime = require('mime');
var ALY = require('aliyun-sdk');
mime.default_type = 'text/plain';

module.exports = function (aws, options) {
  options = options || {};

  if (!options.delay) {
    options.delay = 0;
  }

  var oss = new ALY.OSS({
    accessKeyId: aws.key,
    secretAccessKey: aws.secret,
    endpoint: aws.endpoint,
    apiVersion: '2013-10-15'
  });

  var regexGzip = /\.([a-z]{2,})\.gz$/i;
  var regexGeneral = /\.([a-z]{2,})$/i;

  return es.mapSync(function (file) {

    // Verify this is a file
    if (!file.isBuffer()) {
      return file;
    }

    var uploadPath = file.path.replace(file.base, options.uploadPath || '');
    uploadPath = uploadPath.replace(new RegExp('\\\\', 'g'), '/');

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

    oss.putObject(headers,
      function (err, data) {

        if (err) {
          gutil.log(gutil.colors.red('[FAILED]', file.path + " -> " + uploadPath));
          gutil.log(err);
          return;
        }

        gutil.log(gutil.colors.green('[SUCCESS]', file.path + " -> " + uploadPath));

      });

    return file;
  });
};

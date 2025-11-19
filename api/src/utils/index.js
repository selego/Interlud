const { S3_ACCESSKEYID, S3_ENDPOINT, S3_SECRETACCESSKEY } = require("../config");

const AWS = require("aws-sdk");
const passwordValidator = require("password-validator");

function uploadToS3FromBuffer(path, buffer, ContentType) {
  return new Promise((resolve, reject) => {
    let s3bucket = new AWS.S3({
      endpoint: S3_ENDPOINT,
      accessKeyId: S3_ACCESSKEYID,
      secretAccessKey: S3_SECRETACCESSKEY,
    });

    var params = {
      ACL: "public-read",
      Bucket: "bank",
      Key: path,
      Body: buffer,
      ContentEncoding: "base64",
      ContentType,
      Metadata: { "Cache-Control": "max-age=31536000" },
    };
    s3bucket.upload(params, function (err, data) {
      if (err) return reject(`error in callback:${err}`);
      resolve(data.Location);
    });
  });
}

function validatePassword(password) {
  const schema = new passwordValidator();
  schema
    .is()
    .min(6) // Minimum length 6
    .is()
    .max(100) // Maximum length 100
    .has()
    .letters(); // Must have letters

  return schema.validate(password);
}


const BREVO_TEMPLATES = {};

module.exports = {
  uploadToS3FromBuffer,
  validatePassword,
  BREVO_TEMPLATES,
};

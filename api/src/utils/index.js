const passwordValidator = require("password-validator");
const { S3_ACCESSKEYID, S3_ENDPOINT, S3_SECRETACCESSKEY } = require("../config");

const AWS = require("aws-sdk");
const BUCKET_NAME = "socialipem";

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

function uploadToS3FromBuffer(path, buffer, ContentType) {
  return new Promise((resolve, reject) => {
    let s3bucket = new AWS.S3({
      endpoint: S3_ENDPOINT,
      accessKeyId: S3_ACCESSKEYID,
      secretAccessKey: S3_SECRETACCESSKEY,
    });

    var params = {
      ACL: "public-read",
      Bucket: BUCKET_NAME,
      Key: path,
      Body: buffer,
      ContentEncoding: "base64",
      ContentType,
      Metadata: { "Cache-Control": "max-age=31536000" },
    };

    s3bucket.upload(params, function (err, data) {
      if (err) return reject(`error in callback:${err}`);
      // Ensure URL is absolute
      let location = data.Location;
      if (!location.startsWith("http://") && !location.startsWith("https://")) {
        location = `https://${location}`;
      }
      resolve(location);
    });
  });
}

function getFilesFromS3Folder(folder) {
  const s3 = new AWS.S3({
    endpoint: S3_ENDPOINT,
    accessKeyId: S3_ACCESSKEYID,
    secretAccessKey: S3_SECRETACCESSKEY,
  });
  const params = {
    Bucket: BUCKET_NAME,
    Prefix: folder,
  };
  const files = [];
  return new Promise((resolve, reject) => {
    s3.listObjectsV2(params, (err, data) => {
      if (err) return reject(err);
      data.Contents.forEach((file) => {
        files.push({
          fileName: file.Key.split("/").pop(),
          fileUrl: `https://${BUCKET_NAME}.${S3_ENDPOINT}/${file.Key}`,
        });
      });
      resolve(files);
    });
  });
}

// Fonction pour nettoyer le HTML
function cleanHtml(html) {
  // Balises à conserver (contenu informatif)
  const allowedTags = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "span",
    "div",
    "article",
    "section",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "strong",
    "b",
    "em",
    "i",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "blockquote",
    "pre",
    "code",
    "main",
    "aside",
    "header",
    "footer",
    "time",
  ];

  let cleanedHtml = html;

  // 1. Supprimer les scripts, styles, et commentaires
  cleanedHtml = cleanedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  cleanedHtml = cleanedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleanedHtml = cleanedHtml.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Supprimer tous les attributs class et style de toutes les balises
  cleanedHtml = cleanedHtml.replace(/\s+class\s*=\s*["'][^"']*["']/gi, "");
  cleanedHtml = cleanedHtml.replace(/\s+style\s*=\s*["'][^"']*["']/gi, "");

  // 3. Supprimer les autres attributs non essentiels mais garder href, src, alt, title, datetime
  cleanedHtml = cleanedHtml.replace(/<(\w+)([^>]*?)>/gi, (match, tagName, attributes) => {
    if (!allowedTags.includes(tagName.toLowerCase())) {
      return ""; // Supprimer complètement les balises non autorisées
    }

    // Garder seulement les attributs essentiels
    const essentialAttrs = [];
    const attrMatches = attributes.match(/(\w+)\s*=\s*["'][^"']*["']/g) || [];

    attrMatches.forEach((attr) => {
      const attrName = attr.split("=")[0].trim().toLowerCase();
      if (["href", "src", "alt", "title", "datetime"].includes(attrName)) {
        essentialAttrs.push(attr);
      }
    });

    return `<${tagName}${essentialAttrs.length > 0 ? " " + essentialAttrs.join(" ") : ""}>`;
  });

  // 4. Nettoyer les balises fermantes orphelines
  const tagPattern = /<\/(\w+)>/gi;
  cleanedHtml = cleanedHtml.replace(tagPattern, (match, tagName) => {
    return allowedTags.includes(tagName.toLowerCase()) ? match : "";
  });

  // 5. Supprimer les espaces multiples et les lignes vides
  cleanedHtml = cleanedHtml.replace(/\s+/g, " ");
  cleanedHtml = cleanedHtml.replace(/>\s+</g, "><");
  cleanedHtml = cleanedHtml.trim();

  return cleanedHtml;
}

const BREVO_TEMPLATES = {};

module.exports = {
  uploadToS3FromBuffer,
  BREVO_TEMPLATES,
  validatePassword,
  getFilesFromS3Folder,
  cleanHtml,
};

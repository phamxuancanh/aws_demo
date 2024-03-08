const express = require('express')
const multer = require('multer')
const AWS = require('aws-sdk')
require('dotenv').config()
const path = require('path');
const PORT = 3000
const bodyParser = require('body-parser');

const app = express()
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({ extended: false }))
app.use(express.static('./views'))

app.set('view engine', 'ejs')
app.set('views', './views')
process.env.AWS_SDK_SUPRESS_MAINTENANCE_MODE_MESSAGE = 1

AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY_ID,
    region: process.env.REGION
})

const s3 = new AWS.S3()
const dynamodb = new AWS.DynamoDB.DocumentClient()

const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYANMODB_TABLE_NAME

const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '')
    }
})

const upload = multer({
    storage,
    limits: {
        fileSize: 2000000},
    fileFilter(req, file, callback) {
        checkFileType(file, callback)
    }
})

function checkFileType(file, callback) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = fileTypes.test(file.mimetype)
    if(extname && mimetype) {
        return callback(null, true)
    }
    return callback('Error: Images Only!')
}
 
app.get('/', async (req, res) => {
    // return res.render('index', { courses })
    try{
        const params = {
            TableName: tableName
        }
        const data = await dynamodb.scan(params).promise()
        // console.log('Data from DynamoDB', data.Items)
        return res.render('index.ejs', { courses: data.Items })
    }catch(err){
        console.log('Error retrieving data from DynamoDB', err)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
})
// app.
app.post('/save',upload.single('file'), (req, res) => {
    try{
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const id = req.body.id
        const name = req.body.name
        const semester = req.body.semester
        const department = req.body.department
        const image = req.file ? req.file.originalname.split('.') : [];
        const fileType = image[image.length - 1]
        const filePath = `${id}_${Date.now().toString()}.${fileType}`

        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read' 
        }

        s3.upload(paramsS3, async (err, data) => {
            if(err) {
                console.log('Error uploading file to S3', err)
                return res.status(500).json({ message: 'Internal Server Error' })
            }
            else{
                console.log('File uploaded to S3', data)
                const imageURL = data.Location
                const paramsDynamoDB = {
                    TableName: tableName,
                    Item: {
                        id : id,
                        name: name,
                        semester: semester,
                        department: department,
                        image: imageURL
                    }
                }
                await dynamodb.put(paramsDynamoDB).promise()
                return res.redirect('/')
            }
        })
    }catch(err){
        console.log('Error saving data to DynamoDB', err)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
})

app.post('/delete', upload.fields([]), (req, res) => {
    try {
        const listCheckboxSelected = req.body.delete;
        if (!listCheckboxSelected || Object.keys(listCheckboxSelected).length === 0) {
            return res.redirect('/');
        }
        function onDeleteItem(length) {
            if (length < 0) {
                return res.redirect('/');
            }
            const params = {
                TableName: tableName,
                Key: {
                    id: listCheckboxSelected[length]
                }
            };
            dynamodb.delete(params, (err, data) => {
                if (err) {
                    console.log('Error deleting item from DynamoDB', err);
                    return res.status(500).json({ message: 'Internal Server Error' });
                } else {
                    onDeleteItem(length - 1);
                }
            });
        }
        onDeleteItem(Object.keys(listCheckboxSelected).length - 1);
    } catch (err) {
        console.log('Error deleting item from DynamoDB', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`)
})

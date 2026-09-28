const { logEvents } = require('./logger')

const errorHandler = (err, req, res, next) => {
    if (err.type === 'entity.too.large' || err.status === 413) return res.status(413).json({message:'The application data is too large for one request. Update JobPilot and Rescan; oversized questions may need manual entry.'});
    logEvents(`${err.name}: ${err.message}\t${req.method}\t${req.url}\t${req.headers.origin}`, 'errLog.log')
    console.log(err.stack)

    const status = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500)

    res.status(status)

    res.json({ message: err.message })
}

module.exports = errorHandler

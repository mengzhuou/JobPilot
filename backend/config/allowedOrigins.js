// only these url are allowed to access our api, otherwise our api is open to the public
const allowedOrigins = [
    'http://localhost:3000',
]

module.exports = allowedOrigins
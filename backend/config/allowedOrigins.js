// only these url are allowed to access our api, otherwise our api is open to the public
const allowedOrigins = [
    'http://localhost:3000',
    'https://jobpilot-frontend-pzv8.onrender.com',
    'https://jobpilotlaunch.com'
]

module.exports = allowedOrigins
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const usersDir = path.join(__dirname, 'users');
if (!fs.existsSync(usersDir)) {
  fs.mkdirSync(usersDir, { recursive: true });
}

const username = 'migue';
const email = 'migue@lexcode.com';
const password = 'test123';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  const userData = {
    username: username,
    email: email,
    password: hash,
    createdAt: new Date().toISOString()
  };
  
  const userFile = path.join(usersDir, email + '.json');
  fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
  console.log('Usuario creado exitosamente:', email);
  process.exit(0);
});


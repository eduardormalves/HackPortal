const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const port = 5380;
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Diretório de arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Sessões
app.use(session({
  secret: 'uma-chave-secreta-muito-forte',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hora
}));

app.listen(port, () => {
  console.log(`Servidor rodando na porta: ${port}`);
});

module.exports = app;
const express = require('express');
const path = require('path');
const bodyParser = require ('body-parser');
const session = require('express-session');

const port = 5380;
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

//Configurando o diretório de arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

//Configurando o Middleware Body-Parser de JSONs
app.use(bodyParser.json());
//Usando BodyParser para receber dados pela URL
app.use(bodyParser.urlencoded({extended: true}));

//Configurando o Middleware Body-Parser de URL Encoded
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({
  secret: 'uma-chave-secreta-muito-forte', // Troque para uma string segura
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // sessão dura 1 hora (em milissegundos)
}));

app.listen(port, () => {
    console.log(`Servidor rodando na porta: ${port}`);
})

module.exports = app;
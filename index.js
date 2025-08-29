const app = require('./config/conf'); 
const connection = require('./config/db');
const upload = require('./config/upload');
const cron = require('node-cron');

const DATA_TESTE = '2025-07-02'; // Data fixa pra testes

// Função que retorna a data atual ou a data de teste, se definida
function getDataAtual() {
  // Se DATA_TESTE estiver definida, usa ela senão, pega a data atual
  // Formato YYYY-MM-DD
  return DATA_TESTE ? new Date(DATA_TESTE).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
}

// Função que atualiza o status dos hackathons no banco
function atualizarStatusHackton(idProf, callback) {
  const hoje = getDataAtual(); // Pega a data atual (ou de teste)

  // Se um ID de professor for passado, atualiza apenas os hackathons dele
  if (idProf) {
    // SQL pra marcar hackathons como "Em Aberto" se a data de inscrição ainda não acabou
    const sqlParaAberto = `
      UPDATE hackton
      SET status = 'Em Aberto'
      WHERE fk_professor = ?
        AND status IN ('Em Aberto', 'Em Andamento')
        AND ? <= data_inscricao_max
    `;
    // SQL pra marcar como "Em Andamento" se a inscrição acabou
    const sqlParaAndamento = `
      UPDATE hackton
      SET status = 'Em Andamento'
      WHERE fk_professor = ?
        AND status IN ('Em Aberto', 'Em Andamento')
        AND ? > data_inscricao_max
        AND ? >= data_inicio
        AND ? <= data_fim
    `;
    // SQL pra marcar como "Finalizado" se o hackathon já terminou
    const sqlParaFinalizado = `
      UPDATE hackton
      SET status = 'Finalizado'
      WHERE fk_professor = ?
        AND status IN ('Em Aberto', 'Em Andamento', 'Finalizado')
        AND ? > data_fim
    `;

    // Executa as queries em sequência, passando o ID do professor e a data atual
    connection.query(sqlParaAberto, [idProf, hoje], (err1) => {
      if (err1) return callback(err1); // Se der erro, retorna o erro pro callback
      connection.query(sqlParaAndamento, [idProf, hoje, hoje, hoje], (err2) => {
        if (err2) return callback(err2);
        connection.query(sqlParaFinalizado, [idProf, hoje], (err3) => {
          if (err3) return callback(err3);
          callback(null); // Tudo certo, chama o callback sem erro
        });
      });
    });
  } else {
    // Se não passar ID do professor, atualiza todos os hackathons do sistema
    // Marca como "Em Andamento" os hackathons cujo período de inscrição acabou e estão no período ativo
    const sqlAtualizaAbertoParaAndamento = `
      UPDATE hackton
      SET status = 'Em Andamento'
      WHERE status = 'Em Aberto'
        AND data_inicio <= ? AND data_fim >= ?
    `;
    // Marca como "Finalizado" os hackathons que já passaram da data de término
    const sqlAtualizaAndamentoParaFinalizado = `
      UPDATE hackton
      SET status = 'Finalizado'
      WHERE (status = 'Em Andamento' OR status = 'Em Aberto')
        AND data_fim < ?
    `;
    connection.query(sqlAtualizaAbertoParaAndamento, [hoje, hoje], (err1) => {
      if (err1) return callback(err1);
      connection.query(sqlAtualizaAndamentoParaFinalizado, [hoje], (err2) => {
        if (err2) return callback(err2);
        callback(null); // Tudo certo, sem erro
      });
    });
  }
}

// Função que inicia a atualização dos status dos hackathons
function iniciarAtualizacaoStatusHacktons() {
  // Executa a atualização assim que o servidor inicia
  atualizarStatusHackton(null, (err) => {
    if (err) {
      console.error('Erro ao atualizar status dos hacktons na inicialização:', err);
    } else {
      console.log('Status dos hacktons atualizados na inicialização.');
    }
  });
  // Agenda a atualização pra rodar todo dia à meia-noite
  cron.schedule('0 0 * * *', () => {
    atualizarStatusHackton(null, (err) => {
      if (err) {
        console.error('Erro ao atualizar status dos hacktons no cron:', err);
      } else {
        console.log('Status dos hacktons atualizados no cron à meia-noite.');
      }
    });
  });
}

// Inicia a função de atualização dos hackathons
iniciarAtualizacaoStatusHacktons();

// Rota pra página inicial (login)
app.get('/', (req, res) => {
  res.render('login'); // Renderiza a tela de login (login.ejs)
});

// Rota pra processar o login
app.post('/enviaLogin', (req, res) => {
  const { login, senha, perfil } = req.body; // Pega os dados do formulário (email, senha e perfil)
  let tabela;
  // Define a tabela com base no perfil (aluno ou professor)
  if (perfil === 'professor') {
    tabela = 'professor';
  } else if (perfil === 'aluno') {
    tabela = 'aluno';
  } else {
    return res.status(400).send('Perfil inválido'); // Erro se o perfil não for válido
  }
  // Query SQL pra buscar o usuário pelo email e senha
  const sql = `SELECT * FROM ?? WHERE email_edu = ? AND senha = ?`;
  connection.query(sql, [tabela, login, senha], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.'); // Erro no banco
    }
    if (results.length > 0) {
      const user = results[0]; // Pega o primeiro resultado (usuário encontrado)
      // Salva os dados do usuário na sessão
      if (perfil === 'professor') {
        req.session.user = {
          perfil,
          nome: user.nome,
          matricula: user.matricula,
          nascimento: user.nascimento,
          email_edu: user.email_edu,
          id_professor: user.ID_professor // ID do professor pra usar em outras rotas
        };
        return res.redirect('/pdashboard'); // Redireciona pro dashboard do professor
      } else {
        req.session.user = {
          perfil,
          nome: user.nome,
          matricula: user.matricula,
          nascimento: user.nascimento,
          email_edu: user.email_edu,
          id_aluno: user.ID_aluno, // ID do aluno
          curso: user.curso,
          coins: user.coins // Coins do aluno
        };
        return res.redirect('/adashboard'); // Redireciona pro dashboard do aluno
      }
    } else {
      return res.status(401).send('Login ou senha inválidos.'); // Erro de credenciais
    }
  });
});

// Rota pra cadastrar um novo aluno (parece que só cadastra alunos, não professores)
app.post('/cadastrarUsuario', (req, res) => {
  // Pega os dados do formulário de cadastro
  const { nome, email_edu, matricula, data_nascimento, curso, senha, confirmar_senha } = req.body;
  // Verifica se as senhas coincidem
  if (senha !== confirmar_senha) {
    return res.status(400).send('As senhas não coincidem.');
  }
  // Insere o novo aluno no banco
  const sql = `INSERT INTO aluno (nome, email_edu, matricula, nascimento, curso, senha, coins)
               VALUES (?, ?, ?, ?, ?, ?, 0)`;
  const values = [nome, email_edu, matricula, data_nascimento, curso, senha];
  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Erro ao cadastrar aluno:', error);
      return res.status(500).send('Erro ao cadastrar. Tente novamente.');
    }
    res.redirect('/'); // Redireciona pro login após cadastro
  });
});

// Rota pro dashboard do aluno
app.get('/adashboard', (req, res) => {
  // Verifica se o usuário é aluno e está logado
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/'); // Redireciona pro login se não for
  }
  const email = req.session.user.email_edu;
  if (!email) {
    return res.redirect('/'); // Redireciona se não tiver email na sessão
  }
  // Busca os dados do aluno (nome e coins)
  const sqlAluno = 'SELECT ID_aluno, nome, coins FROM aluno WHERE email_edu = ?';
  connection.query(sqlAluno, [email], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.');
    }
    if (results.length === 0) {
      return res.redirect('/'); // Redireciona se não encontrar o aluno
    }
    const user = results[0];
    // Busca o histórico do aluno (inscrições, envio de fotos e hackathons encerrados)
    const sqlHistorico = `
      SELECT h.nome AS hackton_nome, 'Você fez a inscrição no hackton' AS acao, p.data_inscricao AS data
      FROM participacao p
      INNER JOIN hackton h ON p.hackton_id = h.id_hackton
      WHERE p.aluno_id = ?
      UNION
      SELECT h.nome AS hackton_nome,
             CASE
               WHEN f.status = 'pendente' AND NOT EXISTS (
                 SELECT 1 FROM foto f2
                 WHERE f2.aluno_id = f.aluno_id
                   AND f2.hackton_id = f.hackton_id
                   AND f2.data_envio < f.data_envio
               ) THEN 'Você enviou uma foto'
               WHEN f.status = 'pendente' THEN 'Você alterou a foto'
               WHEN f.status = 'recusado' THEN 'Foto recusada pelo professor'
             END AS acao,
             f.data_envio AS data
      FROM foto f
      INNER JOIN hackton h ON f.hackton_id = h.id_hackton
      WHERE f.aluno_id = ?
      UNION
      SELECT h.nome AS hackton_nome, 'Hackton Encerrado' AS acao, h.data_fim AS data
      FROM hackton h
      INNER JOIN participacao p ON h.id_hackton = p.hackton_id
      WHERE p.aluno_id = ? AND h.status = 'Fechado'
      ORDER BY data DESC
    `;
    connection.query(sqlHistorico, [user.ID_aluno, user.ID_aluno, user.ID_aluno], (errHist, historico) => {
      if (errHist) {
        console.error(errHist);
        return res.status(500).send('Erro ao buscar histórico.');
      }
      // Renderiza o dashboard do aluno com nome, coins e histórico
      res.render('alunoDashboard', {
        nome: user.nome,
        coins: user.coins,
        historico
      });
    });
  });
});

// Rota pra página de hackathons do aluno
app.get('/ahacktons', (req, res) => {
  // Verifica se o usuário é aluno e está logado
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }
  // Atualiza o status dos hackathons antes de carregar a página
  atualizarStatusHackton(null, (errAtualiza) => {
    if (errAtualiza) {
      console.error('Erro ao atualizar status dos hacktons:', errAtualiza);
    }
    const email = req.session.user.email_edu;
    // Busca o ID do aluno
    const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';
    connection.query(sqlAluno, [email], (err, alunoResults) => {
      if (err || alunoResults.length === 0) {
        console.error('Erro ao buscar aluno:', err);
        return res.status(500).send('Erro no servidor.');
      }
      const alunoId = alunoResults[0].ID_aluno;
      // Busca os hackathons que o aluno está inscrito
      const sqlHacktonsInscritos = `
        SELECT h.*, h.status
        FROM hackton h
        INNER JOIN participacao p ON h.id_hackton = p.hackton_id
        WHERE p.aluno_id = ?
        ORDER BY h.data_inicio ASC
      `;
      // Busca os hackathons disponíveis pra inscrição
      const sqlHacktonsDisponiveis = `
        SELECT h.*
        FROM hackton h
        WHERE h.data_inscricao_max >= CURDATE()
          AND h.id_hackton NOT IN (SELECT hackton_id FROM participacao WHERE aluno_id = ?)
        ORDER BY h.data_inicio ASC
      `;
      connection.query(sqlHacktonsInscritos, [alunoId], (errInscritos, hacktonsInscritos) => {
        if (errInscritos) {
          console.error('Erro ao buscar hacktons inscritos:', errInscritos);
          return res.status(500).send('Erro ao carregar hacktons.');
        }
        connection.query(sqlHacktonsDisponiveis, [alunoId], (errDisponiveis, hacktonsDisponiveis) => {
          if (errDisponiveis) {
            console.error('Erro ao buscar hacktons disponíveis:', errDisponiveis);
            return res.status(500).send('Erro ao carregar hacktons disponíveis.');
          }
          // Busca fotos enviadas pelo aluno
          const sqlFotos = 'SELECT hackton_id, caminho FROM foto WHERE aluno_id = ?';
          connection.query(sqlFotos, [alunoId], (errFotos, fotos) => {
            if (errFotos) {
              console.error('Erro ao buscar fotos:', errFotos);
              return res.status(500).send('Erro ao carregar fotos.');
            }
            const hacktonsComFoto = fotos.map(f => f.hackton_id);
            // Função pra calcular o status do hackathon com base nas datas
            function calculaStatus(h) {
              const dataRef = DATA_TESTE ? new Date(DATA_TESTE) : new Date();
              const dataInscricaoMax = new Date(h.data_inscricao_max);
              const dataInicio = new Date(h.data_inicio);
              const dataFim = new Date(h.data_fim);
              if (dataRef <= dataInscricaoMax) return 'Em Aberto';
              if (dataRef >= dataInicio && dataRef <= dataFim) return 'Em Andamento';
              if (dataRef > dataFim) return 'Finalizado';
              return h.status || 'Indefinido';
            }
            // Adiciona status e info de inscrição/foto aos hackathons
            hacktonsInscritos.forEach(h => {
              h.statusExibido = calculaStatus(h);
              h.fotoEnviada = hacktonsComFoto.includes(h.id_hackton);
              h.inscrito = true;
            });
            hacktonsDisponiveis.forEach(h => {
              h.statusExibido = calculaStatus(h);
              h.inscrito = false;
            });
            // Separa hackathons em andamento e em aberto
            const emAndamento = hacktonsInscritos.filter(h =>
              h.statusExibido === 'Em Andamento' || h.statusExibido === 'Inscrito'
            );
            const inscritosEmAberto = hacktonsInscritos.filter(h =>
              h.statusExibido === 'Em Aberto'
            );
            // Renderiza a página de hackathons
            res.render('alunoHacktons', {
              emAndamento,
              inscritosEmAberto,
              emAberto: hacktonsDisponiveis
            });
          });
        });
      });
    });
  });
});

// Rota pra inscrever o aluno em um hackathon
app.post('/participar/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/'); // Verifica se é aluno logado
  }
  const idHackton = req.params.idHackton; // ID do hackathon
  const email = req.session.user.email_edu;
  // Busca o ID do aluno
  const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';
  connection.query(sqlAluno, [email], (err, alunoResults) => {
    if (err || alunoResults.length === 0) {
      console.error('Erro ao buscar aluno:', err);
      return res.status(500).send('Erro ao buscar aluno.');
    }
    const idAluno = alunoResults[0].ID_aluno;
    const dataInscricao = getDataAtual(); // Pega a data atual (ou de teste)
    // Insere a participação no banco
    const sqlInsert = 'INSERT INTO participacao (aluno_id, hackton_id, data_inscricao) VALUES (?, ?, ?)';
    connection.query(sqlInsert, [idAluno, idHackton, dataInscricao], (insertErr) => {
      if (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY') {
          return res.redirect('/ahacktons'); // Ignora se o aluno já está inscrito
        }
        console.error('Erro ao registrar participação:', insertErr);
        return res.status(500).send('Erro ao registrar participação.');
      }
      res.redirect('/ahacktons'); // Redireciona pra página de hackathons
    });
  });
});

// Rota pra enviar ou atualizar uma foto pro hackathon
app.post('/enviar-foto', upload.single('foto'), (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/'); // Verifica se é aluno logado
  }
  const email = req.session.user.email_edu;
  const { id_hackton } = req.body; // ID do hackathon
  // Busca o ID do aluno
  connection.query('SELECT ID_aluno FROM aluno WHERE email_edu = ?', [email], (err, results) => {
    if (err || results.length === 0) {
      console.error('Erro ao encontrar aluno:', err);
      return res.status(500).send('Erro ao encontrar aluno.');
    }
    const id_aluno = results[0].ID_aluno;
    // Verifica o status do hackathon
    const sqlCheckHackton = 'SELECT status FROM hackton WHERE id_hackton = ?';
    connection.query(sqlCheckHackton, [id_hackton], (errStatus, hackton) => {
      if (errStatus || hackton.length === 0) {
        console.error('Erro ao verificar hackathon:', errStatus);
        return res.status(500).send('Erro ao verificar hackathon.');
      }
      if (hackton[0].status === 'Fechado') {
        return res.status(400).send('Não é possível enviar/editar fotos para um hackathon fechado.');
      }
      const foto_path = req.file.filename; // Caminho da foto enviada
      const data_envio = DATA_TESTE ? new Date(DATA_TESTE) : new Date(); // Data de envio
      // Verifica se o aluno já enviou uma foto pro hackathon
      const sqlBuscarFoto = 'SELECT id_foto, caminho FROM foto WHERE aluno_id = ? AND hackton_id = ?';
      connection.query(sqlBuscarFoto, [id_aluno, id_hackton], (errBuscar, fotos) => {
        if (errBuscar) {
          console.error('Erro ao buscar foto existente:', errBuscar);
          return res.status(500).send('Erro ao processar foto.');
        }
        if (fotos.length > 0) {
          // Se já existe foto, atualiza com a nova
          const id_foto_antiga = fotos[0].id_foto;
          const sqlUpdateFoto = 'UPDATE foto SET caminho = ?, data_envio = ?, status = "pendente" WHERE id_foto = ?';
          connection.query(sqlUpdateFoto, [foto_path, data_envio, id_foto_antiga], (errUpdate) => {
            if (errUpdate) {
              console.error('Erro ao atualizar foto:', errUpdate);
              return res.status(500).send('Erro ao salvar foto.');
            }
            return res.redirect('/ahacktons');
          });
        } else {
          // Se não existe foto, insere uma nova
          const sqlInsertFoto = 'INSERT INTO foto (aluno_id, hackton_id, caminho, data_envio, status) VALUES (?, ?, ?, ?, "pendente")';
          connection.query(sqlInsertFoto, [id_aluno, id_hackton, foto_path, data_envio], (errInsert) => {
            if (errInsert) {
              console.error('Erro ao salvar a foto:', errInsert);
              return res.status(500).send('Erro ao salvar a foto.');
            }
            // Adiciona 1 coin ao aluno por enviar a foto
            const sqlUpdateCoins = 'UPDATE aluno SET coins = coins + 1 WHERE ID_aluno = ?';
            connection.query(sqlUpdateCoins, [id_aluno], (errCoins) => {
              if (errCoins) {
                console.error('Erro ao atualizar coins do aluno:', errCoins);
                return res.status(500).send('Erro ao atualizar coins.');
              }
              return res.redirect('/ahacktons');
            });
          });
        }
      });
    });
  });
});

// Rota pro dashboard do professor
app.get('/pdashboard', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  const idProf = req.session.user.id_professor;
  // Atualiza o status dos hackathons do professor
  atualizarStatusHackton(idProf, (errAtualiza) => {
    if (errAtualiza) {
      console.error('Erro ao atualizar status dos hacktons:', errAtualiza);
      return res.status(500).send('Erro ao atualizar hacktons.');
    }
    // Busca todos os hackathons do professor
    const sql = `SELECT * FROM hackton WHERE fk_professor = ? ORDER BY data_inicio ASC`;
    connection.query(sql, [idProf], (err, results) => {
      if (err) {
        console.error('Erro ao buscar hacktons:', err);
        return res.status(500).send('Erro ao carregar hacktons.');
      }
      // Separa os hackathons por status
      const emAberto = results.filter(h => h.status === 'Em Aberto');
      const emAndamento = results.filter(h => h.status === 'Em Andamento');
      const encerrados = results.filter(h => h.status === 'Fechado' || h.status === 'Finalizado');
      // Renderiza o dashboard do professor
      res.render('professorDashboard', {
        emAberto,
        emAndamento,
        encerrados
      });
    });
  });
});

// Rota pra página de cadastro de hackathons
app.get('/pcadastroh', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  res.render('professorCadastroH'); // Renderiza a página de cadastro
});

// Rota pra processar o cadastro de um hackathon
app.post('/enviaPCadastroH', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  // Pega os dados do formulário
  const { nome, dataInscricaoMax, dataInicio, dataFim, local } = req.body;
  const fk_professor = req.session.user.id_professor;
  const hoje = getDataAtual();
  // Define o status inicial do hackathon
  let status = 'Fechado';
  if (dataInicio > hoje) {
    status = 'Em Aberto';
  } else if (dataFim >= hoje) {
    status = 'Em Andamento';
  }
  // Insere o hackathon no banco
  const sql = `
    INSERT INTO hackton (nome, data_inscricao_max, data_inicio, data_fim, local, status, fk_professor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [nome, dataInscricaoMax, dataInicio, dataFim, local, status, fk_professor];
  connection.query(sql, values, (error) => {
    if (error) {
      console.error('Erro ao cadastrar hackton:', error);
      return res.status(500).send('Erro ao cadastrar hackton.');
    }
    res.redirect('/pdashboard'); // Redireciona pro dashboard
  });
});

// Rota pra página de validação de fotos
app.get('/pvalidarf', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  const idProf = req.session.user.id_professor;
  // Atualiza o status dos hackathons
  atualizarStatusHackton(idProf, (err) => {
    if (err) {
      console.error('Erro ao atualizar status dos hacktons:', err);
      return res.status(500).send('Erro ao carregar hacktons.');
    }
    // Busca hackathons finalizados
    const sqlHacktonsFinalizados = `
      SELECT * FROM hackton
      WHERE fk_professor = ? AND status = 'Finalizado'
      ORDER BY data_inicio ASC
    `;
    // Busca hackathons fechados
    const sqlHacktonsFechados = `
      SELECT * FROM hackton
      WHERE fk_professor = ? AND status = 'Fechado'
      ORDER BY data_inicio ASC
    `;
    connection.query(sqlHacktonsFinalizados, [idProf], (errEnc, hacktonsFinalizados) => {
      if (errEnc) {
        console.error('Erro ao buscar hacktons finalizados:', errEnc);
        return res.status(500).send('Erro ao carregar hacktons.');
      }
      connection.query(sqlHacktonsFechados, [idProf], (errFch, hacktonsFechados) => {
        if (errFch) {
          console.error('Erro ao buscar hacktons fechados:', errFch);
          return res.status(500).send('Erro ao carregar hacktons.');
        }
        // Busca fotos pendentes pra cada hackathon finalizado
        const promisesFinalizados = hacktonsFinalizados.map(hackton => {
          return new Promise((resolve, reject) => {
            const sqlFotosPendentes = `
              SELECT 
                f.id_foto,
                a.ID_aluno as id_aluno,
                a.nome as nome_aluno,
                a.email_edu,
                f.caminho,
                f.data_envio
              FROM foto f
              INNER JOIN aluno a ON f.aluno_id = a.ID_aluno
              WHERE f.hackton_id = ? AND f.status = 'pendente'
              ORDER BY f.data_envio DESC
            `;
            connection.query(sqlFotosPendentes, [hackton.id_hackton], (err2, participantes) => {
              if (err2) return reject(err2);
              hackton.participantes = participantes;
              hackton.temFotosPendentes = participantes.length > 0;
              resolve();
            });
          });
        });
        // Busca participantes de hackathons fechados
        const promisesFechados = hacktonsFechados.map(hackton => {
          return new Promise((resolve, reject) => {
            const sqlParticipantes = `
              SELECT 
                a.nome as nome_aluno,
                a.email_edu
              FROM participacao p
              INNER JOIN aluno a ON p.aluno_id = a.ID_aluno
              WHERE p.hackton_id = ?
            `;
            connection.query(sqlParticipantes, [hackton.id_hackton], (err3, participantes) => {
              if (err3) return reject(err3);
              hackton.participantes = participantes;
              resolve();
            });
          });
        });
        // Espera todas as queries terminarem
        Promise.all([...promisesFinalizados, ...promisesFechados])
          .then(() => {
            // Renderiza a página de validação de fotos
            res.render('professorValidarFoto', {
              hacktonsPendentes: hacktonsFinalizados,
              hacktonsFinalizados: hacktonsFechados
            });
          })
          .catch(error => {
            console.error('Erro ao buscar participantes:', error);
            res.status(500).send('Erro ao carregar participantes.');
          });
      });
    });
  });
});

// Rota pra rejeitar uma foto enviada por um aluno
app.post('/rejeitar-foto', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  const { id_foto, id_aluno } = req.body; // Pega ID da foto e do aluno
  if (!id_foto || !id_aluno) {
    return res.status(400).send('Dados inválidos.');
  }
  // Inicia uma transação pra garantir consistência
  connection.beginTransaction(err => {
    if (err) {
      console.error('Erro na transação:', err);
      return res.status(500).send('Erro no servidor.');
    }
    const dataRecusa = getDataAtual();
    // Marca a foto como recusada
    const sqlUpdateFoto = 'UPDATE foto SET status = "recusado", data_envio = ? WHERE id_foto = ?';
    connection.query(sqlUpdateFoto, [dataRecusa, id_foto], (errUpdate) => {
      if (errUpdate) {
        return connection.rollback(() => {
          console.error('Erro ao atualizar status da foto:', errUpdate);
          res.status(500).send('Erro ao rejeitar foto.');
        });
      }
      // Remove 1 coin do aluno (mas não deixa ficar negativo)
      const sqlCoins = `
        UPDATE aluno
        SET coins = GREATEST(coins - 1, 0)
        WHERE ID_aluno = ?
      `;
      connection.query(sqlCoins, [id_aluno], (errUpd) => {
        if (errUpd) {
          return connection.rollback(() => {
            console.error('Erro ao atualizar coins:', errUpd);
            res.status(500).send('Erro ao rejeitar foto.');
          });
        }
        // Confirma a transação
        connection.commit(errCommit => {
          if (errCommit) {
            return connection.rollback(() => {
              console.error('Erro ao finalizar transação:', errCommit);
              res.status(500).send('Erro ao rejeitar foto.');
            });
          }
          res.redirect('/pvalidarf'); // Redireciona pra página de validação
        });
      });
    });
  });
});

// Rota pra fechar um hackathon
app.post('/finalizar-hackton/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/'); // Verifica se é professor logado
  }
  const idHackton = req.params.idHackton;
  // Marca o hackathon como "Fechado"
  const sql = `
    UPDATE hackton
    SET status = 'Fechado'
    WHERE id_hackton = ?
  `;
  connection.query(sql, [idHackton], (err) => {
    if (err) {
      console.error('Erro ao encerrar hackton:', err);
      return res.status(500).send('Erro ao finalizar hackton.');
    }
    res.redirect('/pvalidarf'); // Redireciona pra página de validação
  });
});

// Rota pra buscar a foto de um hackathon (usada por AJAX, provavelmente)
app.get('/get-foto/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.status(401).json({ error: 'Acesso não autorizado' }); // Verifica se é aluno
  }
  const idHackton = req.params.idHackton;
  const email = req.session.user.email_edu;
  // Busca o caminho da foto enviada pelo aluno pro hackathon
  const sql = `
    SELECT f.caminho
    FROM foto f
    INNER JOIN aluno a ON f.aluno_id = a.ID_aluno
    WHERE f.hackton_id = ? AND a.email_edu = ?
  `;
  connection.query(sql, [idHackton, email], (err, results) => {
    if (err) {
      console.error('Erro ao buscar foto:', err);
      return res.status(500).json({ error: 'Erro ao buscar foto' });
    }
    if (results.length > 0) {
      res.json({ caminho: results[0].caminho }); // Retorna o caminho da foto
    } else {
      res.json({ caminho: null }); // Retorna null se não houver foto
    }
  });
});

// Rota pra página de perfil
app.get('/profile', (req, res) => {
  // Verifica se o usuário é aluno ou professor e está logado
  if (!req.session.user || (req.session.user.perfil !== 'professor' && req.session.user.perfil !== 'aluno')) {
    return res.redirect('/');
  }
  const { perfil, email_edu } = req.session.user;
  if (perfil === 'aluno') {
    // Busca os dados do aluno
    const sql = 'SELECT nome, matricula, nascimento, email_edu, curso, coins FROM aluno WHERE email_edu = ?';
    connection.query(sql, [email_edu], (err, results) => {
      if (err || results.length === 0) {
        console.error('Erro ao buscar dados do aluno:', err);
        return res.status(500).send('Erro ao carregar perfil.');
      }
      const user = results[0];
      // Renderiza a página de perfil com os dados do aluno
      res.render('profile', {
        perfil,
        nome: user.nome,
        matricula: user.matricula,
        nascimento: user.nascimento,
        email_edu: user.email_edu,
        curso: user.curso,
        coins: user.coins,
        error: null,
        success: null
      });
    });
  } else {
    // Busca os dados do professor
    const sql = 'SELECT nome, matricula, nascimento, email_edu FROM professor WHERE email_edu = ?';
    connection.query(sql, [email_edu], (err, results) => {
      if (err || results.length === 0) {
        console.error('Erro ao buscar dados do professor:', err);
        return res.status(500).send('Erro ao carregar perfil.');
      }
      const user = results[0];
      // Renderiza a página de perfil com os dados do professor
      res.render('profile', {
        perfil,
        nome: user.nome,
        matricula: user.matricula,
        nascimento: user.nascimento,
        email_edu: user.email_edu,
        error: null,
        success: null
      });
    });
  }
});

// Rota pra alterar a senha
app.post('/alterar-senha', (req, res) => {
  if (!req.session.user || (req.session.user.perfil !== 'professor' && req.session.user.perfil !== 'aluno')) {
    return res.redirect('/'); // Verifica se está logado
  }
  const { senha_atual, nova_senha, confirmar_nova_senha } = req.body;
  const { perfil, email_edu } = req.session.user;
  let tabela = perfil === 'professor' ? 'professor' : 'aluno';
  let idColumn = perfil === 'professor' ? 'ID_professor' : 'ID_aluno';
  // Verifica se as senhas novas coincidem
  if (nova_senha !== confirmar_nova_senha) {
    return res.render('profile', {
      ...req.session.user,
      error: 'As senhas não coincidem.',
      success: null
    });
  }
  // Verifica se a senha atual está correta
  const sqlCheck = `SELECT senha FROM ?? WHERE email_edu = ?`;
  connection.query(sqlCheck, [tabela, email_edu], (err, results) => {
    if (err || results.length === 0) {
      console.error('Erro ao verificar senha atual:', err);
      return res.status(500).send('Erro ao verificar senha.');
    }
    if (results[0].senha !== senha_atual) {
      return res.render('profile', {
        ...req.session.user,
        error: 'Senha atual incorreta.',
        success: null
      });
    }
    // Atualiza a senha no banco
    const sqlUpdate = `UPDATE ?? SET senha = ? WHERE email_edu = ?`;
    connection.query(sqlUpdate, [tabela, nova_senha, email_edu], (errUpdate) => {
      if (errUpdate) {
        console.error('Erro ao atualizar senha:', errUpdate);
        return res.status(500).send('Erro ao atualizar senha.');
      }
      // Renderiza o perfil com mensagem de sucesso
      res.render('profile', {
        ...req.session.user,
        error: null,
        success: 'Senha alterada com sucesso!'
      });
    });
  });
});
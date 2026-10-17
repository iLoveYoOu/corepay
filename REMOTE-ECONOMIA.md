# Economia de banda — alteração local

Sem migração de banco, mudança de autenticação ou atualização obrigatória de APK.

- Cada tela inicia pausada e exige Play. Pause bloqueia imagens e novos comandos nesta aba, limpa a imagem e cancela download pendente.
- Aba oculta pausa todas as telas. Voltar não retoma automaticamente.
- Dois minutos sem Play ou comando pausam a tela, mesmo se o operador apenas estiver observando.
- Uma consulta de imagem por segundo, no máximo, por aparelho. Status a cada 10 segundos somente com aba visível.
- O servidor calcula SHA-256 das imagens recebidas. Se o navegador já possui o mesmo conteúdo, responde 204 sem reenviá-lo. Autenticação e prazo de validade da imagem continuam obrigatórios.
- Contador por cartão mostra apenas bytes de imagem recebidos enquanto o cartão existe. Não inclui cabeçalhos, comandos, outros usuários/abas/serviços nem equivale ao faturamento Render.

Pause não encerra MediaProjection no celular. O APK antigo continua enviando imagens e consultando comandos. Para encerrar completamente o compartilhamento, use Desativar acesso remoto no celular. Não há botão Stop no painel com promessa de desligar o Android.

A economia real depende do tempo em Play e tamanho/mudança das imagens. Não há garantia de ficar abaixo de 5 GB. Exemplo meramente aritmético: dois celulares, imagens de 30 kB que mudam a cada segundo e uma hora de Play por dia geram cerca de 6,48 GB de imagens em 30 dias, fora outros tráfegos. Compare o consumo do workspace no Render antes/depois da implantação.

Testes: remote.js, remote-persistence.js, remote-multi.js, remote-keyboard.js, remote-ui.js. Publicação depende de autorização separada; esta documentação não comprova implantação.

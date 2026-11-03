' finhub · arranque con Windows (plantilla para copiarla a mano)
' Lo normal es «finhub arranque activar», que crea este fichero con tus rutas en la carpeta Inicio:
'   Win+R → shell:startup
' Si lo copias a mano, cambia Ubuntu, la ruta de node y la de finhub por las tuyas
' (en WSL: echo $WSL_DISTRO_NAME · which node · ruta del repo/bin/finhub.js).
CreateObject("WScript.Shell").Run "wsl.exe -d Ubuntu -- ""/usr/bin/node"" ""/home/TU-USUARIO/finhub/bin/finhub.js"" --primer-plano --silencioso", 0, False

Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.Run "cmd /c ssh -o StrictHostKeyChecking=no ubuntu@145.239.73.39 ""mkdir -p ~/.ssh && echo ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOx7E/XGOjzHbajaOnfZ7W8dC5DBss/RBLc1cAy2Tg2n mcdor@Life >> ~/.ssh/authorized_keys""", 1, False
WScript.Sleep 2000
WshShell.SendKeys "fXDXY3pQ6PdT"
WshShell.SendKeys "{ENTER}"
WScript.Sleep 2000

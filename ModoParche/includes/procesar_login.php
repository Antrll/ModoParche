<?php
session_start();
require 'conexion.php';

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header('Location: login.php');
    exit;
}

$credencial = trim($_POST['credencial'] ?? '');
$password   = $_POST['password'] ?? '';

try {
    // 1. Buscamos al usuario por correo o teléfono
    $sql = "SELECT id, nombre, password_hash, estado_id FROM usuarios
            WHERE email = :credencial OR telefono = :credencial";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['credencial' => $credencial]);
    $usuario = $stmt->fetch();

    // 2. Verificamos existencia y contraseña
    if ($usuario && password_verify($password, $usuario['password_hash'])) {

        // 3. Revisamos el estado de la cuenta
        if ($usuario['estado_id'] != 1) { // 1 = activo
            $mensajesEstado = [
                2 => 'Tu cuenta está suspendida temporalmente.',
                3 => 'Tu cuenta fue baneada por mala reputación.',
                4 => 'Tu cuenta aún no ha sido validada.',
            ];
            $msg = $mensajesEstado[$usuario['estado_id']] ?? 'Tu cuenta no está activa.';
            echo "<script>alert(" . json_encode($msg) . "); window.history.back();</script>";
            exit;
        }

        // 4. Login exitoso
        $_SESSION['usuario_id'] = $usuario['id'];
        $_SESSION['nombre']     = $usuario['nombre'];

        $saludo = "¡Bienvenido al radar de planes, " . $usuario['nombre'] . "!";
        echo "<script>
                alert(" . json_encode($saludo) . ");
                window.location.href='index.html';
              </script>";
    } else {
        echo "<script>
                alert('Datos incorrectos. Intenta de nuevo o regístrate.');
                window.history.back();
              </script>";
    }
} catch (PDOException $e) {
    echo "<script>alert('Error en el sistema. Intenta más tarde.'); window.history.back();</script>";
}

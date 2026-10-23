<?php
session_start();
require 'conexion.php';

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header('Location: login.php');
    exit;
}

function volver($msg) {
    echo "<script>alert(" . json_encode($msg) . "); window.history.back();</script>";
    exit;
}

// --- Datos personales (paso 1) ---
$nombre   = trim($_POST['nombre'] ?? '');
$cedula   = trim($_POST['cedula'] ?? '');
$telefono = trim($_POST['telefono'] ?? '');
$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

// --- Datos de perfil (pasos 2 y 3) ---
$ciudad_id        = (int)($_POST['ciudad_id'] ?? 0);
$fecha_nacimiento = trim($_POST['fecha_nacimiento'] ?? '') ?: null;
$categorias       = $_POST['categorias'] ?? [];
$instagram        = trim($_POST['instagram_usuario'] ?? '');

// --- Validaciones ---
if ($nombre === '' || $cedula === '' || $telefono === '' || $email === '') {
    volver('Todos los campos personales son obligatorios.');
}
if (!preg_match('/^(?=.*[A-Z]).{8,}$/', $password)) {
    volver('La contraseña debe tener mínimo 8 caracteres y una letra mayúscula.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    volver('El correo no es válido.');
}
if ($ciudad_id <= 0) {
    volver('Selecciona tu ciudad.');
}
if (empty($categorias)) {
    volver('Selecciona al menos una categoría de interés.');
}

try {
    // Evitamos duplicados antes de intentar insertar (email, cédula y teléfono son UNIQUE)
    $check = $pdo->prepare(
        "SELECT id FROM usuarios WHERE email = :email OR cedula = :cedula OR telefono = :telefono"
    );
    $check->execute(['email' => $email, 'cedula' => $cedula, 'telefono' => $telefono]);
    if ($check->fetch()) {
        volver('Ya existe una cuenta con ese correo, cédula o teléfono.');
    }

    $password_hash = password_hash($password, PASSWORD_DEFAULT);

    $pdo->beginTransaction();

    // 1) Usuario completo (ya con ciudad y fecha de nacimiento, no en dos pasos)
    $sql = "INSERT INTO usuarios
                (id, cedula, nombre, email, telefono, password_hash, fecha_nacimiento, ciudad_id, instagram_usuario, estado_id)
            VALUES
                (UUID(), :cedula, :nombre, :email, :telefono, :password_hash, :fecha_nacimiento, :ciudad_id, :instagram, 1)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'cedula'           => $cedula,
        'nombre'           => $nombre,
        'email'            => $email,
        'telefono'         => $telefono,
        'password_hash'    => $password_hash,
        'fecha_nacimiento' => $fecha_nacimiento,
        'ciudad_id'        => $ciudad_id,
        'instagram'        => $instagram !== '' ? $instagram : null,
    ]);

    // UUID() se genera dentro de MySQL, así que recuperamos el id por email (único)
    $find = $pdo->prepare("SELECT id FROM usuarios WHERE email = :email");
    $find->execute(['email' => $email]);
    $usuario_id = $find->fetchColumn();

    // 2) Categorías de interés seleccionadas
    $ins = $pdo->prepare("INSERT INTO intereses_usuario (usuario_id, categoria_id) VALUES (:uid, :cid)");
    foreach ($categorias as $cat_id) {
        $ins->execute(['uid' => $usuario_id, 'cid' => (int)$cat_id]);
    }

    $pdo->commit();

    // Dejamos al usuario logueado
    $_SESSION['usuario_id'] = $usuario_id;
    $_SESSION['nombre']     = $nombre;

    echo "<script>
            alert('¡Cuenta creada con éxito! Bienvenido a ModoParche.');
            window.location.href='index.html';
          </script>";

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    volver('Hubo un error al crear tu cuenta. Intenta de nuevo.');
}

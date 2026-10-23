<?php


$host    = 'localhost';
$db      = 'modo_parche_db';
$user    = 'root';   // <-- Cambia esto por tu usuario real de MySQL/MariaDB
$pass    = '';        // <-- Cambia esto por tu contraseña real
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    // En producción esto no debería mostrar el mensaje crudo del error.
    die("No fue posible conectar con la base de datos. Verifica conexion.php.");
}

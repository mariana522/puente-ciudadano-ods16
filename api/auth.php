<?php
/**
 * ==============================================================================
 * API REST DE AUTENTICACIN Y GESTIN DE PERFILES (MySQL / XAMPP)
 * Proyecto: Plataforma ODS 16 - Puente de Orientacin Ciudadana
 * Rutas:
 *   POST /backend/auth.php?action=login          -> Iniciar sesin
 *   POST /backend/auth.php?action=register       -> Registro de nuevo usuario
 *   POST /backend/auth.php?action=update_profile -> Actualizar perfil independiente
 *   GET  /backend/auth.php?action=users          -> Listar usuarios registrados
 * ==============================================================================
 */
require_once __DIR__ . '/db_connect.php';

function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

function formatUserRecord($user) {
    return [
        'id'            => $user['codigo'],
        'name'          => $user['nombre'],
        'email'         => $user['correo'],
        'role'          => $user['rol'],
        'avatar'        => $user['avatar'] ?: 'U',
        'phone'         => $user['telefono'] ?: '',
        'specialty'     => $user['especialidad'] ?? '',
        'documentId'    => $user['documento'] ?? '',
        'licenseNumber' => $user['tarjeta_profesional'] ?? '',
        'institution'   => $user['institucion'] ?? '',
        'city'          => $user['ciudad'] ?? '',
        'address'       => $user['direccion'] ?? '',
        'registeredAt'  => $user['fecha_registro'] ?? date('Y-m-d')
    ];
}

$action = $_GET['action'] ?? 'login';
$data = getJsonInput();

try {
    // -------------------------------------------------------------------------
    // 1. INICIAR SESIN (LOGIN)
    // -------------------------------------------------------------------------
    if ($action === 'login') {
        $email = trim($data['email'] ?? '');
        $password = trim($data['password'] ?? '');

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Correo y contrasea son requeridos.']);
            exit();
        }

        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE LOWER(correo) = LOWER(?)");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || $user['password'] !== $password) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Credenciales incorrectas o usuario no registrado en la base de datos.']);
            exit();
        }

        echo json_encode([
            'success' => true,
            'message' => 'Autenticacin exitosa',
            'user'    => formatUserRecord($user)
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 2. REGISTRO DE USUARIO (REGISTER)
    // -------------------------------------------------------------------------
    if ($action === 'register') {
        $nombre = trim($data['name'] ?? '');
        $correo = trim($data['email'] ?? '');
        $password = trim($data['password'] ?? '123456');
        $rol = ($data['role'] ?? '') === 'professional' ? 'professional' : 'citizen';
        $telefono = trim($data['phone'] ?? '');
        $especialidad = trim($data['specialty'] ?? '');
        $documento = trim($data['documentId'] ?? $data['documento'] ?? '');
        $institucion = trim($data['institution'] ?? $data['institucion'] ?? '');
        $ciudad = trim($data['city'] ?? $data['ciudad'] ?? 'Montera, Crdoba');

        if (!$nombre || !$correo) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nombre y correo son obligatorios.']);
            exit();
        }

        // Verificar si el correo ya existe
        $stmtCheck = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(correo) = LOWER(?)");
        $stmtCheck->execute([$correo]);
        if ($stmtCheck->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Ya existe una cuenta con este correo electrnico.']);
            exit();
        }

        $codigo = 'USR-00' . rand(100, 999);
        $avatarParts = explode(' ', $nombre);
        $avatar = strtoupper(substr($avatarParts[0], 0, 1) . (isset($avatarParts[1]) ? substr($avatarParts[1], 0, 1) : ''));

        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (codigo, nombre, correo, password, rol, avatar, telefono, especialidad, documento, institucion, ciudad) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $codigo, $nombre, $correo, $password, $rol, $avatar,
            $telefono ?: null, $especialidad ?: null, $documento ?: null, $institucion ?: null, $ciudad ?: null
        ]);

        $stmtGet = $pdo->prepare("SELECT * FROM usuarios WHERE codigo = ?");
        $stmtGet->execute([$codigo]);
        $newUser = $stmtGet->fetch();

        echo json_encode([
            'success' => true,
            'message' => 'Usuario registrado exitosamente en la base de datos',
            'user'    => formatUserRecord($newUser)
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 3. ACTUALIZAR PERFIL INDEPENDIENTE (UPDATE_PROFILE)
    // -------------------------------------------------------------------------
    if ($action === 'update_profile') {
        $email = trim($data['email'] ?? $data['correo'] ?? '');
        $nombre = trim($data['name'] ?? $data['nombre'] ?? '');
        $telefono = trim($data['phone'] ?? $data['telefono'] ?? '');
        $especialidad = trim($data['specialty'] ?? $data['especialidad'] ?? '');
        $documento = trim($data['documentId'] ?? $data['documento'] ?? '');
        $tarjeta = trim($data['licenseNumber'] ?? $data['tarjeta_profesional'] ?? '');
        $institucion = trim($data['institution'] ?? $data['institucion'] ?? '');
        $ciudad = trim($data['city'] ?? $data['ciudad'] ?? '');
        $direccion = trim($data['address'] ?? $data['direccion'] ?? '');
        $oldEmail = trim($data['oldEmail'] ?? $email);

        if (!$email || !$nombre) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nombre y correo son requeridos para actualizar.']);
            exit();
        }

        // Obtener usuario previo
        $stmtPrev = $pdo->prepare("SELECT * FROM usuarios WHERE LOWER(correo) = LOWER(?)");
        $stmtPrev->execute([$oldEmail]);
        $prevUser = $stmtPrev->fetch();

        if (!$prevUser) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Usuario no encontrado en la base de datos.']);
            exit();
        }

        $avatarParts = explode(' ', $nombre);
        $avatar = strtoupper(substr($avatarParts[0], 0, 1) . (isset($avatarParts[1]) ? substr($avatarParts[1], 0, 1) : ''));

        $stmtUpdate = $pdo->prepare(
            "UPDATE usuarios SET 
                nombre = ?, correo = ?, avatar = ?, telefono = ?, 
                especialidad = ?, documento = ?, tarjeta_profesional = ?, 
                institucion = ?, ciudad = ?, direccion = ?
             WHERE id = ?"
        );
        $stmtUpdate->execute([
            $nombre, $email, $avatar, $telefono ?: null,
            $especialidad ?: null, $documento ?: null, $tarjeta ?: null,
            $institucion ?: null, $ciudad ?: null, $direccion ?: null,
            $prevUser['id']
        ]);

        // Sincronizar casos si el nombre o correo cambiaron
        $oldName = $prevUser['nombre'];
        if ($oldName !== $nombre || $oldEmail !== $email) {
            if ($prevUser['rol'] === 'citizen') {
                $stmtSyncCases = $pdo->prepare("UPDATE casos SET ciudadano = ?, correo_ciudadano = ? WHERE ciudadano = ? OR correo_ciudadano = ?");
                $stmtSyncCases->execute([$nombre, $email, $oldName, $oldEmail]);
            } else if ($prevUser['rol'] === 'professional') {
                $stmtSyncProf = $pdo->prepare("UPDATE casos SET profesional_asignado = ? WHERE profesional_asignado = ?");
                $stmtSyncProf->execute([$nombre, $oldName]);
            }
        }

        $stmtUpdated = $pdo->prepare("SELECT * FROM usuarios WHERE id = ?");
        $stmtUpdated->execute([$prevUser['id']]);
        $updatedUser = $stmtUpdated->fetch();

        echo json_encode([
            'success' => true,
            'message' => 'Perfil actualizado exitosamente',
            'user'    => formatUserRecord($updatedUser)
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 4. LISTAR USUARIOS (GET USERS)
    // -------------------------------------------------------------------------
    if ($action === 'users') {
        $stmt = $pdo->query("SELECT * FROM usuarios ORDER BY rol DESC, id ASC");
        $users = $stmt->fetchAll();
        $formatted = array_map('formatUserRecord', $users);

        echo json_encode([
            'success' => true,
            'data'    => $formatted
        ]);
        exit();
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Accin no vlida solicitada.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

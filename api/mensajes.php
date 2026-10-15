<?php
/**
 * ==============================================================================
 * API REST DE MENSAJERIA EN 3FN Y CHAT EN TIEMPO REAL (ODS 16 - PUENTE CIUDADANO)
 * ==============================================================================
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Email, X-User-Role, X-User-Name');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db_connect.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

function getRequestUser() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $email = $_GET['user_email'] ?? $_GET['userEmail'] ?? $headers['X-User-Email'] ?? $headers['x-user-email'] ?? '';
    $role  = $_GET['user_role'] ?? $_GET['userRole'] ?? $headers['X-User-Role'] ?? $headers['x-user-role'] ?? 'citizen';
    $name  = $_GET['user_name'] ?? $_GET['userName'] ?? $headers['X-User-Name'] ?? $headers['x-user-name'] ?? '';
    return [
        'email' => trim(strtolower($email)),
        'role'  => trim(strtolower($role)),
        'name'  => trim($name)
    ];
}

try {
    // -------------------------------------------------------------------------
    // 1. GET: OBTENER MENSAJES DE UN CASO ESPECIFICO (CON AISLAMIENTO 3FN)
    // -------------------------------------------------------------------------
    if ($method === 'GET' && empty($action)) {
        $caseId = $_GET['caso_codigo'] ?? $_GET['caseId'] ?? $_GET['id'] ?? '';
        $reqUser = getRequestUser();

        if (empty($caseId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'El codigo del caso (caseId) es requerido.']);
            exit();
        }

        // Consultar el caso en vista normalizada para verificar aislamiento
        $stmtCase = $pdo->prepare('SELECT * FROM vista_casos_resumen WHERE codigo = ?');
        $stmtCase->execute([$caseId]);
        $caso = $stmtCase->fetch();

        if (!$caso) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "El caso {$caseId} no existe en la base de datos."]);
            exit();
        }

        // Validacion estricta de aislamiento
        if (!empty($reqUser['email']) || !empty($reqUser['name'])) {
            $citizenEmail = strtolower($caso['correo_ciudadano'] ?? '');
            $citizenName  = strtolower($caso['ciudadano'] ?? '');
            $profEmail    = strtolower($caso['correo_profesional'] ?? '');
            $profName     = strtolower($caso['profesional_asignado'] ?? '');

            $isCitizenOwner = ($reqUser['email'] && $reqUser['email'] === $citizenEmail) ||
                              ($reqUser['name'] && strtolower($reqUser['name']) === $citizenName);
            $isAssignedProf = ($reqUser['email'] && $reqUser['email'] === $profEmail) ||
                              ($reqUser['name'] && strtolower($reqUser['name']) === $profName) ||
                              ($profName === 'por asignar' || $profName === 'sin asignar');

            if (!$isCitizenOwner && !$isAssignedProf) {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'error'   => 'Aislamiento de datos ODS 16: No tienes autorizacion para consultar los mensajes de este caso.'
                ]);
                exit();
            }
        }

        // Obtener historial normalizado en 3FN haciendo JOIN con usuarios y roles
        $dbCasoId = $caso['caso_id'] ?? $caso['id'];
        $sql = "SELECT m.id, m.mensaje, m.hora, m.leido, m.creado_en, 
                       u.nombre AS remitente, u.correo AS remitente_email, r.nombre AS rol
                FROM mensajes m
                JOIN usuarios u ON m.remitente_id = u.id
                JOIN roles r ON u.rol_id = r.id
                WHERE m.caso_id = ?
                ORDER BY m.id ASC";
        $stmtMsg = $pdo->prepare($sql);
        $stmtMsg->execute([$dbCasoId]);
        $rows = $stmtMsg->fetchAll();

        $messages = array_map(function ($m) use ($caseId) {
            return [
                'id'          => 'MSG-' . $m['id'],
                'dbId'        => (int)$m['id'],
                'caseId'      => $caseId,
                'sender'      => $m['remitente'],
                'senderEmail' => $m['remitente_email'],
                'role'        => $m['rol'],
                'text'        => $m['mensaje'],
                'time'        => $m['hora'],
                'read'        => (bool)$m['leido'],
                'createdAt'   => $m['creado_en']
            ];
        }, $rows);

        echo json_encode([
            'success' => true,
            'caseId'  => $caseId,
            'count'   => count($messages),
            'data'    => $messages
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 2. GET: OBTENER CONVERSACIONES ACTIVAS DEL USUARIO (action=conversations)
    // -------------------------------------------------------------------------
    if ($method === 'GET' && $action === 'conversations') {
        $reqUser = getRequestUser();

        if (empty($reqUser['email']) && empty($reqUser['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Se requiere user_email o user_name para consultar conversaciones.']);
            exit();
        }

        if ($reqUser['role'] === 'professional') {
            $stmtCases = $pdo->prepare('SELECT * FROM vista_casos_resumen WHERE LOWER(profesional_asignado) = ? OR LOWER(correo_profesional) = ? ORDER BY caso_id DESC');
            $stmtCases->execute([strtolower($reqUser['name']), $reqUser['email']]);
        } else {
            $stmtCases = $pdo->prepare('SELECT * FROM vista_casos_resumen WHERE LOWER(correo_ciudadano) = ? OR LOWER(ciudadano) = ? ORDER BY caso_id DESC');
            $stmtCases->execute([$reqUser['email'], strtolower($reqUser['name'])]);
        }
        $userCases = $stmtCases->fetchAll();

        $conversations = [];
        foreach ($userCases as $c) {
            $dbCId = $c['caso_id'] ?? $c['id'];
            $stmtLast = $pdo->prepare('SELECT m.*, u.nombre AS remitente FROM mensajes m JOIN usuarios u ON m.remitente_id = u.id WHERE m.caso_id = ? ORDER BY m.id DESC LIMIT 1');
            $stmtLast->execute([$dbCId]);
            $lastMsg = $stmtLast->fetch();

            $contactName = ($reqUser['role'] === 'professional') ? $c['ciudadano'] : ($c['profesional_asignado'] ?: 'Por asignar');
            $contactEmail = ($reqUser['role'] === 'professional') ? $c['correo_ciudadano'] : ($c['correo_profesional'] ?? '');
            $contactRole = ($reqUser['role'] === 'professional') ? 'Ciudadano(a)' : 'Especialista Orientador';

            $avatarParts = explode(' ', trim($contactName));
            $avatar = strtoupper(substr($avatarParts[0], 0, 1) . (isset($avatarParts[1]) ? substr($avatarParts[1], 0, 1) : ''));

            $conversations[] = [
                'caseId'      => $c['codigo'],
                'name'        => $contactName,
                'email'       => $contactEmail,
                'avatar'      => $avatar ?: 'U',
                'role'        => $contactRole,
                'caseTag'     => "#{$c['codigo']} - {$c['tipo']}",
                'status'      => $c['estado'],
                'lastMsg'     => $lastMsg ? $lastMsg['mensaje'] : 'Expediente radicado. Inicia la conversacion aqui.',
                'time'        => $lastMsg ? $lastMsg['hora'] : date('H:i A'),
                'unread'      => 0
            ];
        }

        echo json_encode([
            'success' => true,
            'count'   => count($conversations),
            'data'    => $conversations
        ]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 3. POST: ENVIAR MENSAJE (INSERTAR EN ESQUEMA 3FN CON CONTROL DE ACCESO)
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $data = getJsonInput();

        $caseId      = trim($data['caseId'] ?? $data['caso_codigo'] ?? '');
        $sender      = trim($data['sender'] ?? $data['remitente'] ?? '');
        $senderEmail = trim(strtolower($data['senderEmail'] ?? $data['remitente_email'] ?? ''));
        $role        = trim(strtolower($data['role'] ?? $data['rol'] ?? 'citizen'));
        $text        = trim($data['text'] ?? $data['mensaje'] ?? '');
        $time        = trim($data['time'] ?? $data['hora'] ?? date('h:i A'));

        if (empty($caseId) || empty($text) || empty($sender)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'caseId, sender y text son campos obligatorios.']);
            exit();
        }

        $stmtCase = $pdo->prepare('SELECT * FROM vista_casos_resumen WHERE codigo = ?');
        $stmtCase->execute([$caseId]);
        $caso = $stmtCase->fetch();

        if (!$caso) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "El caso {$caseId} no existe."]);
            exit();
        }

        // Verificar que el remitente pertenezca legitimamente al caso
        $citizenEmail = strtolower($caso['correo_ciudadano'] ?? '');
        $citizenName  = strtolower($caso['ciudadano'] ?? '');
        $profEmail    = strtolower($caso['correo_profesional'] ?? '');
        $profName     = strtolower($caso['profesional_asignado'] ?? '');

        $isCitizen = ($senderEmail && $senderEmail === $citizenEmail) || (strtolower($sender) === $citizenName);
        $isProf    = ($senderEmail && $senderEmail === $profEmail) || (strtolower($sender) === $profName) || ($role === 'professional');

        if (!$isCitizen && !$isProf) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error'   => 'Aislamiento de datos: No puedes enviar mensajes a un expediente al que no estas asignado.'
            ]);
            exit();
        }

        // Resolver ID del remitente
        $senderId = null;
        if (!empty($senderEmail)) {
            $stmtUser = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(correo) = ?");
            $stmtUser->execute([$senderEmail]);
            $senderId = $stmtUser->fetchColumn();
        }
        if (!$senderId) {
            $stmtUser = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(nombre) = ?");
            $stmtUser->execute([strtolower($sender)]);
            $senderId = $stmtUser->fetchColumn();
        }
        if (!$senderId) {
            $senderId = ($role === 'professional') ? 2 : 1;
        }

        $dbCasoId = $caso['caso_id'] ?? $caso['id'];

        $stmtInsert = $pdo->prepare('INSERT INTO mensajes (caso_id, remitente_id, mensaje, hora, leido) VALUES (?, ?, ?, ?, 0)');
        $stmtInsert->execute([$dbCasoId, $senderId, $text, $time]);
        $newId = $pdo->lastInsertId();

        $record = [
            'id'          => 'MSG-' . ($newId ?: time()),
            'dbId'        => (int)$newId,
            'caseId'      => $caseId,
            'sender'      => $sender,
            'senderEmail' => $senderEmail,
            'role'        => $role,
            'text'        => $text,
            'time'        => $time,
            'read'        => false,
            'createdAt'   => date('Y-m-d H:i:s')
        ];

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'message' => 'Mensaje guardado exitosamente en esquema 3FN.',
            'data'    => $record
        ]);
        exit();
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Metodo HTTP no permitido.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

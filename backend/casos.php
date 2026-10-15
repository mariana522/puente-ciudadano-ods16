<?php
/**
 * ==============================================================================
 * API REST DE CASOS CON ARQUITECTURA RELACIONAL 3FN Y AISLAMIENTO DE USUARIOS
 * Proyecto: Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
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

// Determinar tabla o vista relacional
$sourceTable = 'casos';
try {
    $checkView = $pdo->query("SELECT 1 FROM vista_casos_resumen LIMIT 1");
    if ($checkView) $sourceTable = 'vista_casos_resumen';
} catch (Exception $e) {
    $sourceTable = 'casos';
}

try {
    // -------------------------------------------------------------------------
    // 1. GET: CONSULTAR CASO POR CODIGO O LISTAR CASOS AISLADOS
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $codigo = $_GET['codigo'] ?? $_GET['id'] ?? null;
        $reqUser = getRequestUser();
        $isUnassigned = isset($_GET['unassigned']) && ($_GET['unassigned'] === 'true' || $_GET['unassigned'] === '1');

        // A. Consultar caso individual
        if ($codigo) {
            $stmt = $pdo->prepare("SELECT * FROM {$sourceTable} WHERE codigo = ?");
            $stmt->execute([$codigo]);
            $caso = $stmt->fetch();

            if (!$caso) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => "Expediente {$codigo} no encontrado."]);
                exit();
            }

            // Validacion de aislamiento de datos: solo partes involucradas
            if (!empty($reqUser['email']) || !empty($reqUser['name'])) {
                $cEmail = strtolower($caso['correo_ciudadano'] ?? '');
                $cName  = strtolower($caso['ciudadano'] ?? '');
                $pName  = strtolower($caso['profesional_asignado'] ?? '');

                $isOwnerCitizen = ($reqUser['email'] && $reqUser['email'] === $cEmail) ||
                                  ($reqUser['name'] && strtolower($reqUser['name']) === $cName);
                $isAssignedProf = ($reqUser['name'] && strtolower($reqUser['name']) === $pName) ||
                                  ($pName === 'por asignar' || $pName === 'sin asignar');

                if (!$isOwnerCitizen && !$isAssignedProf) {
                    http_response_code(403);
                    echo json_encode([
                        'success' => false,
                        'error'   => 'Aislamiento de datos ODS 16: No tienes autorizacion para acceder a este expediente privado.'
                    ]);
                    exit();
                }
            }

            if (isset($caso['checklist']) && is_string($caso['checklist'])) {
                $caso['checklist'] = json_decode($caso['checklist'] ?: '[]', true);
            }
            echo json_encode(['success' => true, 'data' => $caso]);
            exit();
        }

        // B. Listado con aislamiento estricto segun el usuario y su rol
        if ($reqUser['role'] === 'professional') {
            if ($isUnassigned) {
                $stmt = $pdo->query("SELECT * FROM {$sourceTable} WHERE profesional_asignado IS NULL OR profesional_asignado = 'Por asignar' OR profesional_asignado = 'Sin asignar' ORDER BY caso_id DESC");
                $casos = $stmt->fetchAll();
            } else if (!empty($reqUser['name']) || !empty($reqUser['email'])) {
                $profIdentifier = $reqUser['name'] ?: $reqUser['email'];
                $stmt = $pdo->prepare("SELECT * FROM {$sourceTable} WHERE LOWER(profesional_asignado) = ? OR LOWER(correo_profesional) = ? ORDER BY caso_id DESC");
                $stmt->execute([strtolower($profIdentifier), strtolower($reqUser['email'])]);
                $casos = $stmt->fetchAll();
            } else {
                $stmt = $pdo->query("SELECT * FROM {$sourceTable} ORDER BY caso_id DESC");
                $casos = $stmt->fetchAll();
            }
        } else {
            // Rol Ciudadano: aislamiento TOTAL. Solo casos creados por este ciudadano
            if (!empty($reqUser['email']) || !empty($reqUser['name'])) {
                $stmt = $pdo->prepare("SELECT * FROM {$sourceTable} WHERE LOWER(correo_ciudadano) = ? OR LOWER(ciudadano) = ? ORDER BY caso_id DESC");
                $stmt->execute([$reqUser['email'], strtolower($reqUser['name'])]);
                $casos = $stmt->fetchAll();
            } else {
                $casos = [];
            }
        }

        $result = array_map(function ($c) use ($pdo) {
            $checklist = [];
            if (isset($c['checklist']) && is_string($c['checklist'])) {
                $checklist = json_decode($c['checklist'] ?: '[]', true);
            } else {
                try {
                    $chkStmt = $pdo->prepare("SELECT requisito, completado FROM checklist_casos WHERE caso_id = ?");
                    $chkStmt->execute([$c['caso_id'] ?? $c['id']]);
                    $rows = $chkStmt->fetchAll();
                    $checklist = array_map(function ($r) { return $r['requisito']; }, $rows);
                } catch (Exception $e) {}
            }

            return [
                'id'          => $c['codigo'],
                'citizen'     => $c['ciudadano'],
                'citizenEmail'=> $c['correo_ciudadano'],
                'type'        => $c['tipo'],
                'subType'     => $c['subtipo'],
                'description' => $c['descripcion'],
                'status'      => $c['estado'],
                'assignedTo'  => $c['profesional_asignado'] ?? 'Por asignar',
                'date'        => $c['fecha'] ?? $c['fecha_radicacion'] ?? date('Y-m-d'),
                'institution' => $c['institucion'] ?? 'Consultorio Juridico',
                'instAddress' => $c['direccion_institucion'] ?? '',
                'instPhone'   => $c['telefono_institucion'] ?? '',
                'instHours'   => $c['horario_institucion'] ?? '',
                'checklist'   => $checklist,
                'observations'=> $c['observaciones'] ?? '',
                'roomUrl'     => $c['sala_url'] ?? '',
                'createdAt'   => $c['creado_en'] ?? date('Y-m-d H:i:s')
            ];
        }, $casos);

        echo json_encode(['success' => true, 'count' => count($result), 'data' => $result]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 2. RECLAMAR CASO (action=claim)
    // -------------------------------------------------------------------------
    if ($action === 'claim' && ($method === 'POST' || $method === 'PUT')) {
        $data = getJsonInput();
        $caseId = $data['id'] ?? $data['caseId'] ?? '';
        $profName = $data['profName'] ?? $data['assignedTo'] ?? '';

        if (!$caseId || !$profName) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'caseId y profName son requeridos.']);
            exit();
        }

        // 1. Actualizar estado en casos
        $stmt = $pdo->prepare("UPDATE casos SET estado = 'En curso' WHERE codigo = ?");
        $stmt->execute([$caseId]);

        // 2. Gestionar asignacion formal en 3FN si existe asignaciones_casos
        try {
            $stmtC = $pdo->prepare("SELECT id FROM casos WHERE codigo = ?");
            $stmtC->execute([$caseId]);
            $cDbId = $stmtC->fetchColumn();

            $stmtP = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(nombre) = LOWER(?) LIMIT 1");
            $stmtP->execute([$profName]);
            $pDbId = $stmtP->fetchColumn();

            if ($cDbId && $pDbId) {
                $stmtAc = $pdo->prepare("INSERT INTO asignaciones_casos (caso_id, profesional_id, activo, observaciones) VALUES (?, ?, 1, 'Asignacion auto-reclamada')");
                $stmtAc->execute([$cDbId, $pDbId]);
            }
        } catch (Exception $e) {}

        echo json_encode(['success' => true, 'message' => "Caso {$caseId} asignado exitosamente a {$profName}"]);
        exit();
    }

    // -------------------------------------------------------------------------
    // 3. ACTUALIZAR ESTADO U OBSERVACIONES (PUT o POST action=update)
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || ($method === 'POST' && $action === 'update')) {
        $data = getJsonInput();
        $codigo = $data['id'] ?? $data['codigo'] ?? null;
        $nuevoEstado = $data['status'] ?? $data['estado'] ?? null;
        $observaciones = $data['observations'] ?? $data['observaciones'] ?? null;
        $roomUrl = $data['roomUrl'] ?? $data['sala_url'] ?? null;

        if (!$codigo) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'El identificador del caso (id) es obligatorio.']);
            exit();
        }

        $fields = [];
        $params = [];

        if ($nuevoEstado) {
            $fields[] = 'estado = ?';
            $params[] = $nuevoEstado;
        }
        if ($roomUrl !== null) {
            $fields[] = 'sala_url = ?';
            $params[] = $roomUrl;
        }

        if (!empty($fields)) {
            $params[] = $codigo;
            $sql = 'UPDATE casos SET ' . implode(', ', $fields) . ' WHERE codigo = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }

        if ($observaciones !== null) {
            try {
                $stmtC = $pdo->prepare("SELECT id FROM casos WHERE codigo = ?");
                $stmtC->execute([$codigo]);
                $cDbId = $stmtC->fetchColumn();
                if ($cDbId) {
                    $stmtObs = $pdo->prepare("UPDATE asignaciones_casos SET observaciones = ? WHERE caso_id = ? AND activo = 1");
                    $stmtObs->execute([$observaciones, $cDbId]);
                }
            } catch (Exception $e) {}
        }

        echo json_encode(['success' => true, 'message' => 'Expediente actualizado exitosamente en la base de datos.']);
        exit();
    }

    // -------------------------------------------------------------------------
    // 4. CREAR NUEVO EXPEDIENTE DE CASO (POST EN 3FN)
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $data = getJsonInput();
        $reqUser = getRequestUser();

        $codigo = $data['id'] ?? ('CAS-00' . rand(100, 999));
        $ciudadano = $data['citizen'] ?? ($reqUser['name'] ?: 'Ciudadano Anonimo');
        $correo = strtolower($data['citizenEmail'] ?? ($reqUser['email'] ?: ''));
        $tipo = $data['type'] ?? 'Problema laboral';
        $subtipo = $data['subType'] ?? $tipo;
        $descripcion = $data['description'] ?? '';
        $estado = $data['status'] ?? 'Pendiente';
        $institucion = $data['institution'] ?? 'Consultorio Juridico';
        $checklist = $data['checklist'] ?? [];
        $roomUrl = $data['roomUrl'] ?? null;

        // 1. Resolver usuario ciudadano
        $userId = null;
        if (!empty($correo)) {
            $stmtU = $pdo->prepare("SELECT id FROM usuarios WHERE LOWER(correo) = ?");
            $stmtU->execute([$correo]);
            $userId = $stmtU->fetchColumn();
        }
        if (!$userId) {
            $stmtFirst = $pdo->query("SELECT id FROM usuarios WHERE rol_id = 1 LIMIT 1");
            $userId = $stmtFirst->fetchColumn() ?: 1;
        }

        // 2. Resolver categoria
        $catId = 1;
        try {
            $stmtCat = $pdo->prepare("SELECT id FROM categorias_casos WHERE LOWER(nombre) LIKE ? LIMIT 1");
            $stmtCat->execute(['%' . strtolower($tipo) . '%']);
            $catId = $stmtCat->fetchColumn() ?: 1;
        } catch (Exception $e) {}

        // 3. Resolver institucion
        $instId = 1;
        try {
            $stmtInst = $pdo->prepare("SELECT id FROM instituciones WHERE LOWER(nombre) LIKE ? LIMIT 1");
            $stmtInst->execute(['%' . strtolower($institucion) . '%']);
            $instId = $stmtInst->fetchColumn() ?: 1;
        } catch (Exception $e) {}

        // 4. Insertar caso en tabla casos
        $sql = "INSERT INTO casos (
            codigo, ciudadano_id, categoria_id, institucion_id, subtipo, descripcion,
            estado, fecha_radicacion, sala_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $codigo, $userId, $catId, $instId, $subtipo, $descripcion,
            $estado, date('Y-m-d'), $roomUrl
        ]);
        $casoDbId = $pdo->lastInsertId();

        // 5. Insertar checklist documental en tabla atómica checklist_casos
        if (!empty($checklist) && is_array($checklist)) {
            try {
                $chkInsert = $pdo->prepare("INSERT INTO checklist_casos (caso_id, requisito, completado) VALUES (?, ?, 0)");
                foreach ($checklist as $item) {
                    if (is_string($item) && trim($item) !== '') {
                        $chkInsert->execute([$casoDbId, trim($item)]);
                    }
                }
            } catch (Exception $e) {}
        }

        echo json_encode([
            'success' => true,
            'message' => 'Expediente registrado en esquema relacional 3FN con exito.',
            'id'      => $codigo,
            'data'    => [
                'id'           => $codigo,
                'citizen'      => $ciudadano,
                'citizenEmail' => $correo,
                'status'       => $estado,
                'type'         => $tipo
            ]
        ]);
        exit();
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Metodo HTTP no permitido.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

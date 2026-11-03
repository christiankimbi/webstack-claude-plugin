<?php
// webstack stub for the project's mailer: same class name and send() call, but each
// message is recorded for the checks instead of being sent. Generated per run; the
// class name and argument order come from webstack.json (emails.mailerClass, emails.sendArgs).
class __WEBSTACK_CLASS__ {
    public function __construct(...$args) {}

    public function send(...$args) {
        $order = json_decode((string)file_get_contents(__DIR__ . '/webstack-sendargs.json'), true);
        $message = [];
        foreach ($order as $i => $field) {
            $value = $args[$i] ?? '';
            $message[$field] = is_scalar($value) || $value === null ? (string)$value : json_encode($value);
        }
        $GLOBALS['webstackMessages'][] = $message;
        return ['success' => true];
    }
}

<?php
// webstack stub for the project's config file: defines only the constants listed in
// webstack.json (emails.stubConstants). No SMTP settings and no secrets file are loaded.
foreach (json_decode((string)file_get_contents(__DIR__ . '/webstack-constants.json'), true) ?? [] as $name => $value) {
    if (!defined($name)) define($name, $value);
}

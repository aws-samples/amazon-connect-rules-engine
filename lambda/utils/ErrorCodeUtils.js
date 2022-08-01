class UnauthorizedError extends Error{
    statusCode = 401;
}
class ForbiddenError extends Error{
    statusCode = 403;
}
class BadRequestError extends Error{
    statusCode = 400;
}
class UnhandledError extends Error{
    statusCode = 500;
}
module.exports = {
    UnauthorizedError,ForbiddenError,BadRequestError,UnhandledError
}

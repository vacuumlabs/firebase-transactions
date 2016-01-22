import gulp from 'gulp'
import mocha from 'gulp-mocha'
import runSequence from 'run-sequence'
import eslint from 'gulp-eslint'
import babel from 'gulp-babel'
import rimraf from 'rimraf'


gulp.task('eslint', () => {
  return gulp.src([
    'gulpfile.babel.js',
    'src/**/*.js',
  ])
  .pipe(eslint())
  .pipe(eslint.format())
  .pipe(eslint.failAfterError())
})

gulp.task('end', () => {
  process.exit()
})

gulp.task('_test', () => {
  return gulp.src('test/*.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha({reporter: 'nyan'}))
})

gulp.task('test', ['build'], (done) => {
  // This is needed for circle-ci, that runs tests without i.e. Symbol being defined
  require('babel-polyfill')
  runSequence('eslint', '_test', 'end', done)
})

gulp.task('clean', function(done) {
  rimraf('./lib', done)
})

gulp.task('build', ['clean'], function() {
  return gulp.src(['src/**/*.js', '!src/example/**', '!src/internal*.js'])
    .pipe(babel())
    .pipe(gulp.dest('lib'))
})
